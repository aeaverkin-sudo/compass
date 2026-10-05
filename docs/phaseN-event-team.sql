-- ============================================================
-- Compass — Phase N: event team + who checked a guest in
-- Supabase → SQL Editor → New query.
-- Paste the CONTENTS of this file (Cmd+A, Cmd+C), not the file name.
-- Run once. Safe to run again.
--
-- After phaseN-events.sql and phaseN-event-payments.sql.
-- The app does not apply this file.
--
-- event_team is the organiser's staff. permissions is a set of
-- booleans: checkin, guests, payments, analytics, edit, team.
-- The owner is not a row here. The app reads this with the service
-- role. The browser has no policy.
-- checked_in_by is the person who scanned the badge.
-- ============================================================

create table if not exists public.event_team (
  event_id     uuid not null references public.events(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  permissions  jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  primary key (event_id, user_id),
  constraint event_team_permissions_object check (jsonb_typeof(permissions) = 'object')
);

create index if not exists event_team_user
  on public.event_team (user_id);

alter table public.event_team enable row level security;

alter table public.event_registrations
  add column if not exists checked_in_by uuid references public.profiles(id) on delete set null;
