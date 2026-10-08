-- ============================================================
-- Compass — order of rubrics on a portfolio card
-- Supabase → SQL Editor → New query.
-- Paste the CONTENTS of this file (Cmd+A, Cmd+C), not the file name.
-- Safe to run again.
--
-- Null means the default rubric order (Name, Company, Position, Web, …).
-- rubric_labels renames a section on this card only.
-- item_zones moves a row into another section on this card only.
-- The app does not apply this file.
-- ============================================================

alter table public.cards
  add column if not exists rubric_order jsonb;

alter table public.cards
  add column if not exists rubric_labels jsonb;

alter table public.cards
  add column if not exists item_zones jsonb;
