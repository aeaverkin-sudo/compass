-- ============================================================
-- Compass — Phase 5: one-time notes
-- Supabase → SQL Editor → Run once. Safe to run again.
--
-- A card has at most one pending transfer. It waits 14 days, or
-- until the first real viewer. Voice is always last via sort_order.
-- Bytes stay in the existing private bucket transfer-assets.
-- The consume function is for the service role only.
-- ============================================================

alter table public.transfer_items
  add column if not exists sort_order integer not null default 0;

create unique index if not exists card_transfers_one_pending
  on public.card_transfers (card_id)
  where status = 'pending';

alter table public.card_transfers
  alter column expires_at set default (now() + interval '14 days');

-- One row wins. A second concurrent call skips the locked row and returns null.
create or replace function public.consume_pending_transfer(p_card_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  won uuid;
begin
  with candidate as (
    select id
    from public.card_transfers
    where card_id = p_card_id
      and status = 'pending'
      and expires_at > now()
    order by created_at
    limit 1
    for update skip locked
  )
  update public.card_transfers as transfer
  set status = 'consumed',
      consumed_at = now()
  from candidate
  where transfer.id = candidate.id
  returning transfer.id into won;

  return won;
end;
$$;

revoke all on function public.consume_pending_transfer(uuid) from public;
revoke all on function public.consume_pending_transfer(uuid) from anon;
revoke all on function public.consume_pending_transfer(uuid) from authenticated;
grant execute on function public.consume_pending_transfer(uuid) to service_role;
