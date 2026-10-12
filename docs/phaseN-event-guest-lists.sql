-- ============================================================
-- Compass — Phase N: event guest lists
-- Supabase → SQL Editor → New query.
-- Paste the CONTENTS of this file (Cmd+A, Cmd+C), not the file name.
-- Run once. Safe to run again.
--
-- After phaseN-events.sql and phaseN-event-team.sql.
-- The app does not apply this file.
--
-- event_guest_lists is one uploaded file. The file itself is not stored.
-- event_guests is one person per event. The same email or phone in
-- two lists is one guest with two memberships.
-- event_guest_kept_pairs remembers two guests with one name that the
-- organiser chose to keep apart.
-- The app reads all of this with the service role. The browser has
-- no policy.
-- ============================================================

create table if not exists public.event_guest_lists (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events(id) on delete cascade,
  name        text not null,
  is_paid     boolean not null default false,
  file_name   text,
  row_count   integer not null default 0,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists event_guest_lists_event
  on public.event_guest_lists (event_id);

create table if not exists public.event_guests (
  id               uuid primary key default gen_random_uuid(),
  event_id         uuid not null references public.events(id) on delete cascade,
  name             text not null,
  email            text,
  phone            text,
  token            text not null,
  sent_at          timestamptz,
  send_count       integer not null default 0,
  opened_at        timestamptz,
  registration_id  uuid references public.event_registrations(id) on delete set null,
  unsubscribed_at  timestamptz,
  created_at       timestamptz not null default now(),
  constraint event_guests_token_key unique (token),
  constraint event_guests_token_shape check (token ~ '^[A-Za-z0-9_-]{21}$'),
  constraint event_guests_email_lower check (email is null or email = lower(email)),
  constraint event_guests_contact check (email is not null or phone is not null)
);

create index if not exists event_guests_event
  on public.event_guests (event_id);

create unique index if not exists event_guests_event_email
  on public.event_guests (event_id, email) where email is not null;

create unique index if not exists event_guests_event_phone
  on public.event_guests (event_id, phone) where phone is not null;

create unique index if not exists event_guests_registration
  on public.event_guests (registration_id) where registration_id is not null;

create table if not exists public.event_guest_list_members (
  guest_id  uuid not null references public.event_guests(id) on delete cascade,
  list_id   uuid not null references public.event_guest_lists(id) on delete cascade,
  primary key (guest_id, list_id)
);

create index if not exists event_guest_list_members_list
  on public.event_guest_list_members (list_id);

create table if not exists public.event_guest_kept_pairs (
  event_id    uuid not null references public.events(id) on delete cascade,
  guest_a     uuid not null references public.event_guests(id) on delete cascade,
  guest_b     uuid not null references public.event_guests(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (guest_a, guest_b),
  constraint event_guest_kept_pairs_order check (guest_a < guest_b)
);

create index if not exists event_guest_kept_pairs_event
  on public.event_guest_kept_pairs (event_id);

alter table public.event_guest_lists enable row level security;
alter table public.event_guests enable row level security;
alter table public.event_guest_list_members enable row level security;
alter table public.event_guest_kept_pairs enable row level security;
