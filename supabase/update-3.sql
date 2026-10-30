-- ══════════════════════════════════════════════════════════
--  Rezept-App · Update 3: Mahlzeiten im Wochenplan (Frühstück, Mittag, Abend)
-- ══════════════════════════════════════════════════════════
--  Einmal im Supabase-Dashboard unter "SQL Editor" einfügen und "Run" klicken.
--  Darf mehrfach ausgeführt werden. Neuinstallationen brauchen das nicht
--  (setup.sql enthält es schon).

alter table public.plan add column if not exists mahlzeit text;

alter table public.plan drop constraint if exists plan_mahlzeit;
alter table public.plan add constraint plan_mahlzeit
  check (mahlzeit is null or mahlzeit in ('frueh', 'mittag', 'abend'));
