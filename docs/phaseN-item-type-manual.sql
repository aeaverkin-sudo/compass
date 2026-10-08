-- ============================================================
-- Compass — a row keeps the rubric the owner chose
-- Supabase → SQL Editor → New query.
-- Paste the CONTENTS of this file (Cmd+A, Cmd+C), not the file name.
-- Safe to run again.
--
-- Null or false means the app may still classify the row from its text.
-- The app does not apply this file.
-- ============================================================

alter table public.items
  add column if not exists type_manual boolean;
