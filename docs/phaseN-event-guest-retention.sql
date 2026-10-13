-- ============================================================
-- Compass — Phase N: event guests after the pass is gone
-- Supabase → SQL Editor → New query.
-- Paste the CONTENTS of this file (Cmd+A, Cmd+C), not the file name.
-- Run once. Safe to run again.
--
-- After phaseN-event-guest-lists.sql, phaseN-event-guest-pass.sql,
-- phaseN-event-end-time.sql and phaseN-event-paycode.sql.
-- The app does not apply this file. Until it runs, the code skips
-- what needs these columns.
--
-- 1. A pass account is deleted at the event end + 100 hours. Its
--    registration goes with it, so the list guest keeps In and Paid:
--    the cron copies checked_in_at, paid_status and paid_source
--    from the registration to event_guests before the deletion.
-- 2. 90 days after the event the cron renames its list guests to
--    'Guest' and clears email, phone and the personal link. The rows
--    stay, so the organiser's counts stay. guests_purged_at marks
--    an event as done.
-- 3. Deleting an event erases its guests at once: event_guests
--    already references events on delete cascade.
-- ============================================================

-- 1. In and Paid kept on the list guest.
alter table public.event_guests
  add column if not exists checked_in_at timestamptz,
  add column if not exists paid_status text,
  add column if not exists paid_source text;

alter table public.event_guests drop constraint if exists event_guests_paid_status_check;
alter table public.event_guests
  add constraint event_guests_paid_status_check
  check (paid_status is null or paid_status in ('paid', 'unpaid'));

alter table public.event_guests drop constraint if exists event_guests_paid_source_check;
alter table public.event_guests
  add constraint event_guests_paid_source_check
  check (paid_source is null or paid_source in ('return', 'statement', 'manual', 'name', 'list'));

-- 2. The personal link may be cleared. The shape check lets null through.
alter table public.event_guests
  alter column token drop not null;

alter table public.events
  add column if not exists guests_purge_at timestamptz,
  add column if not exists guests_purged_at timestamptz;

-- The end as the pass clock reads it: ends_at, else the start + 12 hours.
-- An event without a date has no guest deadline. Every write recomputes it,
-- so nobody sets it by hand.
create or replace function public.set_events_guests_purge_at()
returns trigger
language plpgsql
as $$
begin
  new.guests_purge_at :=
    coalesce(new.ends_at, new.date + interval '12 hours') + interval '90 days';
  return new;
end;
$$;

drop trigger if exists events_guests_purge_at on public.events;
create trigger events_guests_purge_at
  before insert or update on public.events
  for each row execute function public.set_events_guests_purge_at();

update public.events
  set guests_purge_at = coalesce(ends_at, date + interval '12 hours') + interval '90 days'
  where guests_purge_at is distinct from coalesce(ends_at, date + interval '12 hours') + interval '90 days';

create index if not exists events_guests_purge_due
  on public.events (guests_purge_at)
  where guests_purged_at is null;

-- The 48-hour mail now follows purge_at.
create index if not exists profiles_event_trial_mail_due
  on public.profiles (purge_at)
  where event_trial = true and freeze_mail_sent_at is null;
