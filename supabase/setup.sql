-- ══════════════════════════════════════════════════════════
--  Rezept-App · Datenbank einrichten
-- ══════════════════════════════════════════════════════════
--  Im Supabase-Dashboard unter "SQL Editor" komplett einfügen und "Run" klicken.
--  Darf mehrfach ausgeführt werden.
--
--  Alle Daten gehören zu einem Haushalt. Wer Mitglied ist, sieht und ändert
--  Rezepte, Wochenplan, Einkaufsliste und Fotos dieses Haushalts – sonst niemand.

-- ---------- Tabellen ----------

create table if not exists public.haushalte (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Unser Haushalt',
  einladecode text not null unique,
  erstellt_am timestamptz not null default now()
);

create table if not exists public.mitglieder (
  user_id uuid primary key references auth.users on delete cascade,
  haushalt_id uuid not null references public.haushalte on delete cascade,
  beigetreten_am timestamptz not null default now()
);

create table if not exists public.rezepte (
  id uuid primary key,
  haushalt_id uuid not null references public.haushalte on delete cascade,
  titel text not null,
  portionen int,
  zutaten jsonb not null default '[]',
  schritte jsonb not null default '[]',
  schlagwoerter text[] not null default '{}',
  notiz text not null default '',
  quelle_url text,
  fotos text[] not null default '{}',
  vorschau text,
  rohtext text,
  erstellt_am timestamptz not null default now(),
  geaendert_am timestamptz not null default now()
);

create table if not exists public.plan (
  id uuid primary key,
  haushalt_id uuid not null references public.haushalte on delete cascade,
  datum date not null,
  rezept_id uuid references public.rezepte on delete cascade,
  titel text, -- Essen ohne Rezept, z. B. "Kalt"
  portionen int,
  auf_liste boolean not null default false,
  erstellt_am timestamptz not null default now(),
  geaendert_am timestamptz not null default now()
);

create table if not exists public.einkauf (
  id uuid primary key,
  haushalt_id uuid not null references public.haushalte on delete cascade,
  name text not null,
  menge numeric,
  einheit text not null default '',
  erledigt boolean not null default false,
  rezept_id uuid references public.rezepte on delete set null,
  sortierung bigint not null default 0,
  erstellt_am timestamptz not null default now(),
  geaendert_am timestamptz not null default now()
);

-- Ältere Installationen auf denselben Stand bringen (entspricht update-2.sql)
alter table public.plan alter column rezept_id drop not null;
alter table public.plan add column if not exists titel text;
alter table public.plan drop constraint if exists plan_rezept_oder_titel;
alter table public.plan add constraint plan_rezept_oder_titel
  check (rezept_id is not null or nullif(trim(titel), '') is not null);

create index if not exists rezepte_haushalt on public.rezepte (haushalt_id);
create index if not exists plan_haushalt on public.plan (haushalt_id, datum);
create index if not exists einkauf_haushalt on public.einkauf (haushalt_id);
create index if not exists mitglieder_haushalt on public.mitglieder (haushalt_id);

-- ---------- Wer gehört wohin? ----------

-- Haushalt des angemeldeten Nutzers (security definer: umgeht RLS auf "mitglieder", sonst Endlosschleife)
create or replace function public.mein_haushalt()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select haushalt_id from public.mitglieder where user_id = auth.uid()
$$;

-- ---------- Row Level Security ----------

alter table public.haushalte enable row level security;
alter table public.mitglieder enable row level security;
alter table public.rezepte enable row level security;
alter table public.plan enable row level security;
alter table public.einkauf enable row level security;

drop policy if exists "eigener haushalt lesen" on public.haushalte;
create policy "eigener haushalt lesen" on public.haushalte
  for select to authenticated using (id = public.mein_haushalt());

drop policy if exists "eigener haushalt umbenennen" on public.haushalte;
create policy "eigener haushalt umbenennen" on public.haushalte
  for update to authenticated using (id = public.mein_haushalt()) with check (id = public.mein_haushalt());

drop policy if exists "mitglieder sehen" on public.mitglieder;
create policy "mitglieder sehen" on public.mitglieder
  for select to authenticated using (haushalt_id = public.mein_haushalt());

drop policy if exists "selbst austreten" on public.mitglieder;
create policy "selbst austreten" on public.mitglieder
  for delete to authenticated using (user_id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array['rezepte', 'plan', 'einkauf'] loop
    execute format('drop policy if exists "haushalt" on public.%I', t);
    execute format(
      'create policy "haushalt" on public.%I for all to authenticated
         using (haushalt_id = public.mein_haushalt())
         with check (haushalt_id = public.mein_haushalt())', t);
  end loop;
end $$;

-- ---------- Haushalt anlegen / beitreten ----------

create or replace function public.haushalt_anlegen(p_name text)
returns public.haushalte
language plpgsql security definer
set search_path = public
as $$
declare
  neu public.haushalte;
  code text;
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet'; end if;
  loop
    -- 6 Zeichen ohne leicht verwechselbare Zeichen (0/O, 1/I)
    code := (select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
             from generate_series(1, 6));
    exit when not exists (select 1 from public.haushalte where einladecode = code);
  end loop;
  insert into public.haushalte (name, einladecode) values (coalesce(nullif(trim(p_name), ''), 'Unser Haushalt'), code)
    returning * into neu;
  insert into public.mitglieder (user_id, haushalt_id) values (auth.uid(), neu.id)
    on conflict (user_id) do update set haushalt_id = excluded.haushalt_id, beigetreten_am = now();
  return neu;
end $$;

create or replace function public.haushalt_beitreten(p_code text)
returns public.haushalte
language plpgsql security definer
set search_path = public
as $$
declare
  ziel public.haushalte;
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet'; end if;
  select * into ziel from public.haushalte where einladecode = upper(trim(p_code));
  if ziel.id is null then raise exception 'Einladecode ungültig'; end if;
  insert into public.mitglieder (user_id, haushalt_id) values (auth.uid(), ziel.id)
    on conflict (user_id) do update set haushalt_id = excluded.haushalt_id, beigetreten_am = now();
  return ziel;
end $$;

revoke all on function public.haushalt_anlegen(text) from public, anon;
revoke all on function public.haushalt_beitreten(text) from public, anon;
grant execute on function public.haushalt_anlegen(text) to authenticated;
grant execute on function public.haushalt_beitreten(text) to authenticated;
grant execute on function public.mein_haushalt() to authenticated;

-- ---------- Echtzeit (andere Handys sehen Änderungen sofort) ----------

do $$
declare t text;
begin
  foreach t in array array['rezepte', 'plan', 'einkauf'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------- Fotos ----------

insert into storage.buckets (id, name, public)
values ('fotos', 'fotos', false)
on conflict (id) do nothing;

-- Pfad: <haushalt_id>/<rezept_id>/<foto>.jpg → erster Ordner muss der eigene Haushalt sein
drop policy if exists "fotos haushalt lesen" on storage.objects;
create policy "fotos haushalt lesen" on storage.objects
  for select to authenticated
  using (bucket_id = 'fotos' and (storage.foldername(name))[1] = public.mein_haushalt()::text);

drop policy if exists "fotos haushalt hochladen" on storage.objects;
create policy "fotos haushalt hochladen" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'fotos' and (storage.foldername(name))[1] = public.mein_haushalt()::text);

drop policy if exists "fotos haushalt ersetzen" on storage.objects;
create policy "fotos haushalt ersetzen" on storage.objects
  for update to authenticated
  using (bucket_id = 'fotos' and (storage.foldername(name))[1] = public.mein_haushalt()::text);

drop policy if exists "fotos haushalt loeschen" on storage.objects;
create policy "fotos haushalt loeschen" on storage.objects
  for delete to authenticated
  using (bucket_id = 'fotos' and (storage.foldername(name))[1] = public.mein_haushalt()::text);
