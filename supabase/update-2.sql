-- ══════════════════════════════════════════════════════════
--  Rezept-App · Update 2: Essen ohne Rezept im Wochenplan
-- ══════════════════════════════════════════════════════════
--  Einmal im Supabase-Dashboard unter "SQL Editor" einfügen und "Run" klicken.
--  Darf mehrfach ausgeführt werden. Neuinstallationen brauchen das nicht
--  (setup.sql enthält es schon).

alter table public.plan alter column rezept_id drop not null;
alter table public.plan add column if not exists titel text;

alter table public.plan drop constraint if exists plan_rezept_oder_titel;
alter table public.plan add constraint plan_rezept_oder_titel
  check (rezept_id is not null or nullif(trim(titel), '') is not null);
