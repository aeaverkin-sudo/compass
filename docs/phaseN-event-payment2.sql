-- ============================================================
-- Compass — Phase N: event payment, without taking the money
-- Supabase → SQL Editor → New query.
-- Paste the CONTENTS of this file (Cmd+A, Cmd+C), not the file name.
-- Run once. Safe to run again.
--
-- After phaseN-event-payments.sql. The app does not apply this file.
-- price and currency are what the guest sees on Pay.
-- badge_gate hides the check-in QR until paid_status is paid.
-- paid_source is return (the return URL), statement (a CSV row),
-- or manual (a tap in the guest list).
-- ============================================================

alter table public.events
  add column if not exists price numeric;

alter table public.events
  add column if not exists currency text default 'EUR';

alter table public.events
  add column if not exists badge_gate boolean default true;

update public.events set currency = 'EUR' where currency is null;
update public.events set badge_gate = true where badge_gate is null;

update public.event_registrations
  set paid_source = 'statement'
  where paid_source = 'csv';

alter table public.event_registrations drop constraint if exists event_registrations_paid_source_check;
alter table public.event_registrations
  add constraint event_registrations_paid_source_check
  check (paid_source is null or paid_source in ('return', 'statement', 'manual'));
