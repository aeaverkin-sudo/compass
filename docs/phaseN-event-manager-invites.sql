-- ============================================================
-- Compass — Phase N: manager invite links
-- Supabase → SQL Editor → New query.
-- Paste the CONTENTS of this file (Cmd+A, Cmd+C), not the file name.
-- Run once. Safe to run again.
--
-- After phaseN-event-team.sql. The app does not apply this file.
--
-- One link carries the rights the organiser chose. Accepting it
-- writes event_team and stamps used_by / used_at. A used link
-- cannot be accepted again. The browser has no policy.
-- ============================================================

create table if not exists public.event_manager_invites (
  token        text primary key,
  event_id     uuid not null references public.events(id) on delete cascade,
  permissions  jsonb not null default '{}'::jsonb,
  created_by   uuid not null references public.profiles(id) on delete cascade,
  used_by      uuid references public.profiles(id) on delete set null,
  used_at      timestamptz,
  created_at   timestamptz not null default now(),
  constraint event_manager_invites_token_shape check (token ~ '^[A-Za-z0-9_-]{21}$'),
  constraint event_manager_invites_permissions_object check (jsonb_typeof(permissions) = 'object')
);

create index if not exists event_manager_invites_event
  on public.event_manager_invites (event_id);

alter table public.event_manager_invites enable row level security;
