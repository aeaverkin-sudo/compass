-- ============================================================
-- Compass — Data can start its count from a date.
-- Supabase → SQL Editor → New query.
-- Paste the CONTENTS of this file (Cmd+A, Cmd+C), not the file name.
-- Safe to run again.
--
-- The app does not apply this file. Until it runs, Data counts
-- all time and RESET changes nothing.
-- No event, share, or save row is deleted. The old count
-- functions are not replaced.
-- ============================================================

create table if not exists public.card_stats_resets (
  card_id uuid primary key references public.cards(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  reset_at timestamptz not null
);

alter table public.card_stats_resets enable row level security;

revoke all on table public.card_stats_resets from public, anon;

drop policy if exists "own stats reset" on public.card_stats_resets;
create policy "own stats reset"
  on public.card_stats_resets
  for all
  using (
    owner_id = auth.uid()
    and exists (select 1 from public.cards c where c.id = card_id and c.owner_id = auth.uid())
  )
  with check (
    owner_id = auth.uid()
    and exists (select 1 from public.cards c where c.id = card_id and c.owner_id = auth.uid())
  );

grant select, insert, update on table public.card_stats_resets to authenticated;
grant select, insert, update on table public.card_stats_resets to service_role;

-- Distinct viewers from a date. The one-argument function stays.
create or replace function public.card_unique_opens_since(card uuid, since timestamptz)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(distinct event.viewer)::integer
  from public.card_events as event
  where event.card_id = card
    and event.type in ('card_open', 'qr_open')
    and event.viewer is not null
    and event.created_at >= since;
$$;

-- Viewers with at least two opens from a date. The one-argument function stays.
create or replace function public.card_repeat_visits_since(card uuid, since timestamptz)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from (
    select event.viewer
    from public.card_events as event
    where event.card_id = card
      and event.type in ('card_open', 'qr_open')
      and event.viewer is not null
      and event.created_at >= since
    group by event.viewer
    having count(*) >= 2
  ) as repeated;
$$;

-- Link taps from a date, one row per line. The one-argument function stays.
create or replace function public.card_link_opens_since(card uuid, since timestamptz)
returns table(item_id uuid, opens integer)
language sql
stable
security definer
set search_path = public
as $$
  select event.item_id, count(*)::integer as opens
  from public.card_events as event
  where event.card_id = card
    and event.type = 'attachment_open'
    and event.item_id is not null
    and event.created_at >= since
  group by event.item_id
  order by count(*) desc, event.item_id;
$$;

revoke all on function public.card_unique_opens_since(uuid, timestamptz) from public;
revoke all on function public.card_unique_opens_since(uuid, timestamptz) from anon;
revoke all on function public.card_unique_opens_since(uuid, timestamptz) from authenticated;
grant execute on function public.card_unique_opens_since(uuid, timestamptz) to service_role;

revoke all on function public.card_repeat_visits_since(uuid, timestamptz) from public;
revoke all on function public.card_repeat_visits_since(uuid, timestamptz) from anon;
revoke all on function public.card_repeat_visits_since(uuid, timestamptz) from authenticated;
grant execute on function public.card_repeat_visits_since(uuid, timestamptz) to service_role;

revoke all on function public.card_link_opens_since(uuid, timestamptz) from public;
revoke all on function public.card_link_opens_since(uuid, timestamptz) from anon;
revoke all on function public.card_link_opens_since(uuid, timestamptz) from authenticated;
grant execute on function public.card_link_opens_since(uuid, timestamptz) to service_role;
