-- ============================================================
-- Compass — Phase 11: card event columns
-- Supabase → SQL Editor → Run once. Safe to run again.
--
-- Additive. Existing card_open and share rows stay.
-- The live line is public.items. card_items is the link table.
-- item_id points at items, which is the id rendered on the card.
-- ============================================================

alter table public.card_events
  add column if not exists item_id uuid references public.items(id) on delete set null;

alter table public.card_events
  add column if not exists viewer text;

create index if not exists idx_card_events_card_type
  on public.card_events (card_id, type);

create index if not exists idx_card_events_card_type_viewer
  on public.card_events (card_id, type, viewer);

create index if not exists idx_card_events_item
  on public.card_events (item_id);

-- Viewers with at least two opens of this card. Service role only.
create or replace function public.card_repeat_visits(card uuid)
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
    group by event.viewer
    having count(*) >= 2
  ) as repeated;
$$;

-- Link taps grouped by the line. Service role only.
create or replace function public.card_link_opens(card uuid)
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
  group by event.item_id
  order by count(*) desc, event.item_id;
$$;

revoke all on function public.card_repeat_visits(uuid) from public;
revoke all on function public.card_repeat_visits(uuid) from anon;
revoke all on function public.card_repeat_visits(uuid) from authenticated;
grant execute on function public.card_repeat_visits(uuid) to service_role;

revoke all on function public.card_link_opens(uuid) from public;
revoke all on function public.card_link_opens(uuid) from anon;
revoke all on function public.card_link_opens(uuid) from authenticated;
grant execute on function public.card_link_opens(uuid) to service_role;

-- The owner may read how many people saved them. Anyone else gets 0.
-- The service role, used by the Data route, still reads the real count.
create or replace function public.connection_save_count(subject uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  role text := coalesce(auth.role(), '');
begin
  if role <> 'service_role' and auth.uid() is distinct from subject then
    return 0;
  end if;
  return (
    select count(*)::integer
    from public.connections
    where saved_owner_id = subject
  );
end;
$$;

revoke all on function public.connection_save_count(uuid) from public;
revoke all on function public.connection_save_count(uuid) from anon;
grant execute on function public.connection_save_count(uuid) to authenticated;
grant execute on function public.connection_save_count(uuid) to service_role;
