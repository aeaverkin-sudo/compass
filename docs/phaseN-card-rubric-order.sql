-- ============================================================
-- Compass — order of rubrics on a portfolio card
-- Supabase → SQL Editor → New query.
-- Paste the CONTENTS of this file (Cmd+A, Cmd+C), not the file name.
-- Safe to run again.
--
-- Null means the default rubric order (Name, Company, Position, Web, …).
-- The app does not apply this file.
-- ============================================================

alter table public.cards
  add column if not exists rubric_order jsonb;
