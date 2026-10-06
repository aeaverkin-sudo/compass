-- ============================================================
-- Compass — whether a saved card can be found by its contents
-- Supabase → SQL Editor → New query.
-- Paste the CONTENTS of this file (Cmd+A, Cmd+C), not the file name.
-- Safe to run again.
--
-- true: people who saved this card can search its visible fields.
-- false: they can still find it by the name they saved.
-- Existing cards become true. The app does not apply this file.
-- ============================================================

alter table public.cards
  add column if not exists searchable boolean not null default true;
