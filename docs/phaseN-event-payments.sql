-- ============================================================
-- Compass — Phase N: event payments
-- Supabase → SQL Editor → New query.
-- Paste the CONTENTS of this file (Cmd+A, Cmd+C), not the file name.
-- Run once. Safe to run again.
--
-- After phaseN-events.sql. The app does not apply this file.
-- A free event has is_paid false and an empty payment link.
-- payment_mode stays manual until a later step.
-- A registration starts unpaid. paid_source stays empty until
-- a return, a CSV row, a manual mark, or the guest marks it.
-- ============================================================

alter table public.events
  add column if not exists is_paid boolean not null default false;

alter table public.events
  add column if not exists payment_url text;

alter table public.events
  add column if not exists payment_mode text not null default 'manual';

alter table public.events drop constraint if exists events_payment_mode_check;
alter table public.events
  add constraint events_payment_mode_check
  check (payment_mode in ('manual'));

alter table public.events drop constraint if exists events_payment_pair_check;
alter table public.events
  add constraint events_payment_pair_check
  check (
    (is_paid = false and payment_url is null)
    or (is_paid = true and payment_url is not null)
  );

alter table public.events drop constraint if exists events_payment_url_http_check;
alter table public.events
  add constraint events_payment_url_http_check
  check (payment_url is null or payment_url ~* '^https?://');

alter table public.event_registrations
  add column if not exists paid_status text not null default 'unpaid';

alter table public.event_registrations drop constraint if exists event_registrations_paid_status_check;
alter table public.event_registrations
  add constraint event_registrations_paid_status_check
  check (paid_status in ('unpaid', 'paid'));

alter table public.event_registrations
  add column if not exists paid_source text;

alter table public.event_registrations drop constraint if exists event_registrations_paid_source_check;
alter table public.event_registrations
  add constraint event_registrations_paid_source_check
  check (paid_source is null or paid_source in ('return', 'csv', 'manual', 'self'));
