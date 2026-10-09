-- ============================================================
-- Compass — portrait look on a portfolio card
-- Supabase → SQL Editor → New query.
-- Paste the CONTENTS of this file (Cmd+A, Cmd+C), not the file name.
-- Safe to run again.
--
-- frame  — a grey outline around the photo
-- shadow — a soft shadow under the photo
-- null   — the plain square
-- The app does not apply this file. Until it is run, the look stays on this device.
-- ============================================================

alter table public.cards
  add column if not exists photo_look text;
