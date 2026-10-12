-- ============================================================
-- Compass — Phase N: a list guest's personal link and pass
-- Supabase → SQL Editor → New query.
-- Paste the CONTENTS of this file (Cmd+A, Cmd+C), not the file name.
-- Run once. Safe to run again.
--
-- After phaseN-event-guest-lists.sql, phase6-accounts.sql and
-- phaseN-event-paycode.sql.
-- The app does not apply this file.
--
-- accepted_at is the tap on I'm going from the personal link.
-- event_trial marks a trial account opened from that link. Its clock
-- follows the event, not the 60-hour trial start.
-- freeze_mail_sent_at keeps the one freeze email from going twice.
-- A consent from the personal link has path 'event' and the guest id.
-- A guest on a paid list is confirmed with paid_source 'list'.
-- ============================================================

alter table public.event_guests
  add column if not exists accepted_at timestamptz;

alter table public.profiles
  add column if not exists event_trial boolean not null default false,
  add column if not exists freeze_mail_sent_at timestamptz;

-- Same rule as the trial clock: the browser cannot set these.
revoke update (event_trial, freeze_mail_sent_at)
  on table public.profiles from anon, authenticated;

create index if not exists profiles_event_trial_frozen
  on public.profiles (draft_expires_at)
  where event_trial = true and freeze_mail_sent_at is null;

alter table public.consents
  add column if not exists guest_id uuid references public.event_guests(id) on delete set null;

alter table public.consents drop constraint if exists consents_path_check;
alter table public.consents
  add constraint consents_path_check
  check (path in ('trial', 'register', 'event'));

alter table public.event_registrations drop constraint if exists event_registrations_paid_source_check;
alter table public.event_registrations
  add constraint event_registrations_paid_source_check
  check (paid_source is null or paid_source in ('return', 'statement', 'manual', 'name', 'list'));
