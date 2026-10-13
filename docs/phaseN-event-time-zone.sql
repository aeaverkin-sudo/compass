-- ============================================================
-- Compass — Phase N: the event's own time zone
-- Supabase → SQL Editor → New query.
-- Paste the CONTENTS of this file (Cmd+A, Cmd+C), not the file name.
-- Run once. Safe to run again.
--
-- date and ends_at stay timestamptz: the moment itself. time_zone is the
-- IANA zone the organiser set the event in. Every screen, preview, mail
-- and PDF reads the clock in this zone, never the viewer's or the server's.
-- New events take the organiser's browser zone. Events made before this
-- file were set in Lisbon.
-- Until it runs, the app reads every event in Europe/Lisbon.
-- ============================================================

alter table public.events
  add column if not exists time_zone text;

update public.events
  set time_zone = 'Europe/Lisbon'
  where time_zone is null or btrim(time_zone) = '';

alter table public.events
  alter column time_zone set default 'Europe/Lisbon';

alter table public.events
  alter column time_zone set not null;

alter table public.events drop constraint if exists events_time_zone_check;
alter table public.events
  add constraint events_time_zone_check
  check (char_length(time_zone) between 1 and 64);
