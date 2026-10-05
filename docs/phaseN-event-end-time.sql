-- ============================================================
-- Compass — Phase N: event end time
-- Supabase → SQL Editor → New query.
-- Paste the CONTENTS of this file (Cmd+A, Cmd+C), not the file name.
-- Run once. Safe to run again.
--
-- After phaseN-events.sql. The app does not apply this file.
-- ends_at is the optional end. Empty means the event has a start only.
-- ============================================================

alter table public.events
  add column if not exists ends_at timestamptz;
