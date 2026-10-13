-- =============================================================================
-- Compass — Phase N: the event cabinet (TZ 44)
-- =============================================================================
-- open_link: the shared link /e/{slug} gives a pass to anyone who enters a
-- name and a contact. Off by default: the event is by invitation, personal
-- links still work. Until this runs, the app reads every event as open, as
-- before.
--
-- capacity: empty means no limit. Every registration counts. Same column as
-- in phaseN-event-open-link-guard.sql; added here too in case that one has
-- not run.
--
-- event_guest_lists.kind: 'file' for an uploaded file, and two system lists
-- made on first use: 'manual' (Added by hand) and 'open' (Open link). One of
-- each per event. System lists cannot be renamed or deleted (checked in the
-- app; the unique index keeps one of each).
-- =============================================================================

alter table public.events
  add column if not exists open_link boolean not null default false;

alter table public.events
  add column if not exists capacity int null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'events_capacity_positive') then
    alter table public.events
      add constraint events_capacity_positive check (capacity is null or capacity > 0);
  end if;
end $$;

alter table public.event_guest_lists
  add column if not exists kind text not null default 'file';

alter table public.event_guest_lists drop constraint if exists event_guest_lists_kind_check;
alter table public.event_guest_lists
  add constraint event_guest_lists_kind_check check (kind in ('file', 'manual', 'open'));

create unique index if not exists event_guest_lists_system
  on public.event_guest_lists (event_id, kind) where kind in ('manual', 'open');
