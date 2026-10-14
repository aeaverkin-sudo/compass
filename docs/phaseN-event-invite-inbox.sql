-- ============================================================
-- Compass — Phase N: the invitation inside the account, Not going
-- Supabase → SQL Editor → New query.
-- Paste the CONTENTS of this file (Cmd+A, Cmd+C), not the file name.
-- Run once. Safe to run again.
--
-- After phaseN-event-guest-pass.sql and phaseN-event-mails.sql.
-- The app does not apply this file. Until it runs, the app works
-- without the Invited block and without Not going.
--
-- event_guests.user_id: the account whose confirmed email
-- (auth.users.email) is the guest's email. Set on Send and at sign-in.
-- event_guests.declined_at: Not going. Cleared when the guest goes after all.
-- A consent from the I'm going button in the mail has path 'mail'.
-- ============================================================

alter table public.event_guests
  add column if not exists user_id uuid references public.profiles(id) on delete set null,
  add column if not exists declined_at timestamptz;

create index if not exists event_guests_user
  on public.event_guests (user_id) where user_id is not null;

alter table public.consents drop constraint if exists consents_path_check;
alter table public.consents
  add constraint consents_path_check
  check (path in ('trial', 'register', 'event', 'mail'));
