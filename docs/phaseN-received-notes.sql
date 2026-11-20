-- ============================================================
-- Compass — received Notes: receipt for the winner, guest hold
-- Supabase → SQL Editor → New query.
-- Paste the CONTENTS of this file (Cmd+A, Cmd+C), not the file name.
-- Safe to run again.
--
-- The app does not apply this file. Until it runs, delivery stays
-- one-shot without a durable guest copy (legacy finish path).
--
-- One transfer yields one receipt for the winning guest claim or
-- signed-in user. File bytes are copied later; the source transfer
-- stays until the copy is ready. Unclaimed guest copies expire in
-- 60 days. Bound Network Notes do not auto-expire.
-- ============================================================

begin;

create table if not exists public.note_receipts (
  id              uuid primary key default gen_random_uuid(),
  transfer_id     uuid not null unique,
  card_id         uuid not null references public.cards(id) on delete cascade,
  guest_claim_id  uuid,
  user_id         uuid references public.profiles(id) on delete cascade,
  connection_id   uuid references public.connections(id) on delete restrict,
  status          text not null default 'copying'
                    check (status in ('copying', 'ready', 'bound', 'purged')),
  expires_at      timestamptz,
  created_at      timestamptz not null default now(),
  bound_at        timestamptz,
  constraint note_receipts_claimant check (
    guest_claim_id is not null or user_id is not null
  )
);

create table if not exists public.note_receipt_items (
  id                    uuid primary key default gen_random_uuid(),
  receipt_id            uuid not null references public.note_receipts(id) on delete cascade,
  type                  text not null check (type in ('text', 'voice', 'selfie')),
  content               text not null default '',
  source_attachment_id  uuid references public.attachments(id) on delete set null,
  attachment_id         uuid references public.attachments(id) on delete set null,
  sort_order            integer not null default 0,
  created_at            timestamptz not null default now()
);

create index if not exists note_receipts_guest_open
  on public.note_receipts (guest_claim_id, card_id)
  where guest_claim_id is not null and status in ('copying', 'ready');

create index if not exists note_receipts_user_open
  on public.note_receipts (user_id, card_id)
  where user_id is not null and status in ('copying', 'ready');

create index if not exists note_receipts_connection
  on public.note_receipts (connection_id)
  where connection_id is not null;

create index if not exists note_receipts_expires
  on public.note_receipts (expires_at)
  where expires_at is not null and status in ('copying', 'ready');

create index if not exists note_receipt_items_receipt
  on public.note_receipt_items (receipt_id, sort_order);

create index if not exists note_receipt_items_attachment
  on public.note_receipt_items (attachment_id)
  where attachment_id is not null;

create index if not exists note_receipt_items_source
  on public.note_receipt_items (source_attachment_id)
  where source_attachment_id is not null;

alter table public.note_receipts enable row level security;
alter table public.note_receipt_items enable row level security;

drop policy if exists "own note receipts" on public.note_receipts;
create policy "own note receipts" on public.note_receipts
  for select using (user_id = auth.uid());

drop policy if exists "own note receipt items" on public.note_receipt_items;
create policy "own note receipt items" on public.note_receipt_items
  for select using (
    exists (
      select 1 from public.note_receipts r
      where r.id = receipt_id and r.user_id = auth.uid()
    )
  );

-- Atomic: burn a sent transfer and insert the receipt + item stubs for the winner.
create or replace function public.claim_sent_transfer(
  p_token text,
  p_card_id uuid,
  p_guest_claim_id uuid,
  p_user_id uuid,
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  won uuid;
  receipt uuid;
begin
  if p_guest_claim_id is null and p_user_id is null then
    return null;
  end if;

  with candidate as (
    select id
    from public.card_transfers
    where transfer_token = p_token
      and card_id = p_card_id
      and status = 'sent'
      and expires_at > now()
    limit 1
    for update skip locked
  )
  update public.card_transfers as transfer
  set status = 'consumed',
      consumed_at = now()
  from candidate
  where transfer.id = candidate.id
  returning transfer.id into won;

  if won is null then
    return null;
  end if;

  insert into public.note_receipts (
    transfer_id, card_id, guest_claim_id, user_id, status, expires_at
  ) values (
    won, p_card_id, p_guest_claim_id, p_user_id, 'copying', p_expires_at
  )
  returning id into receipt;

  insert into public.note_receipt_items (
    receipt_id, type, content, source_attachment_id, sort_order
  )
  select receipt, type, coalesce(content, ''), attachment_id, coalesce(sort_order, 0)
  from public.transfer_items
  where transfer_id = won;

  return jsonb_build_object('receipt_id', receipt, 'transfer_id', won);
end;
$$;

-- Atomic: burn a pending (QR) transfer and insert the receipt for the winner.
create or replace function public.claim_pending_transfer(
  p_card_id uuid,
  p_guest_claim_id uuid,
  p_user_id uuid,
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  won uuid;
  receipt uuid;
begin
  if p_guest_claim_id is null and p_user_id is null then
    return null;
  end if;

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

  if won is null then
    return null;
  end if;

  insert into public.note_receipts (
    transfer_id, card_id, guest_claim_id, user_id, status, expires_at
  ) values (
    won, p_card_id, p_guest_claim_id, p_user_id, 'copying', p_expires_at
  )
  returning id into receipt;

  insert into public.note_receipt_items (
    receipt_id, type, content, source_attachment_id, sort_order
  )
  select receipt, type, coalesce(content, ''), attachment_id, coalesce(sort_order, 0)
  from public.transfer_items
  where transfer_id = won;

  return jsonb_build_object('receipt_id', receipt, 'transfer_id', won);
end;
$$;

revoke all on function public.claim_sent_transfer(text, uuid, uuid, uuid, timestamptz) from public;
revoke all on function public.claim_sent_transfer(text, uuid, uuid, uuid, timestamptz) from anon;
revoke all on function public.claim_sent_transfer(text, uuid, uuid, uuid, timestamptz) from authenticated;
grant execute on function public.claim_sent_transfer(text, uuid, uuid, uuid, timestamptz) to service_role;

revoke all on function public.claim_pending_transfer(uuid, uuid, uuid, timestamptz) from public;
revoke all on function public.claim_pending_transfer(uuid, uuid, uuid, timestamptz) from anon;
revoke all on function public.claim_pending_transfer(uuid, uuid, uuid, timestamptz) from authenticated;
grant execute on function public.claim_pending_transfer(uuid, uuid, uuid, timestamptz) to service_role;

commit;
