-- =============================================================================
-- Compass — Phase N: seats and the open link guard
-- =============================================================================
-- capacity: empty means no limit. Every registration counts, whatever the
-- source (lists, the open link, members). going >= capacity shows Sold out
-- and the open link creates no new pass. Same column as in TZ 44.
--
-- event_pass_attempts: one row per pass created on the open link. At most
-- five per address per event in ten minutes, above that 429. The address is
-- stored only as sha256(event_id:ip). Rows older than an hour are removed by
-- the app. Only the service role reads and writes it.
-- Until this runs, the app counts attempts in memory of one server.
-- =============================================================================

alter table public.events
  add column if not exists capacity int null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'events_capacity_positive') then
    alter table public.events
      add constraint events_capacity_positive check (capacity is null or capacity > 0);
  end if;
end $$;

create table if not exists public.event_pass_attempts (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events(id) on delete cascade,
  ip_hash     text not null,
  created_at  timestamptz not null default now()
);

create index if not exists event_pass_attempts_recent
  on public.event_pass_attempts (event_id, ip_hash, created_at);

alter table public.event_pass_attempts enable row level security;
