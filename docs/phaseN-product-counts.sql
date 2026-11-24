-- ============================================================
-- Compass — daily product totals. No names, contacts, or visitors.
-- Supabase → SQL Editor → New query.
-- Paste the CONTENTS of this file (Cmd+A, Cmd+C), not the file name.
-- Safe to run again.
--
-- The app does not apply this file. Until it runs, the actions still
-- work and no total is stored. Ordinary accounts and public pages
-- cannot read this table. The report is the service role in Supabase.
-- Rows older than 90 days are deleted by the hourly purge.
-- An objection is one mark per account. It deletes totals linked to
-- that account and the bump function will not add new ones.
-- ============================================================

create table if not exists public.product_daily_counts (
  day date not null,
  action text not null check (action in (
    'registration_email',
    'registration_google',
    'registration_apple',
    'contact_manual',
    'contact_scan',
    'contact_voice',
    'contact_photo',
    'card_saved',
    'card_accepted',
    'share_link',
    'open_qr',
    'open_other'
  )),
  card_id uuid,
  owner_id uuid,
  total integer not null default 0 check (total >= 0),
  card_key uuid generated always as (
    coalesce(card_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) stored,
  constraint product_daily_counts_scope check (
    (
      action in ('share_link', 'open_qr', 'open_other')
      and card_id is not null
      and owner_id is not null
    )
    or (
      action not in ('share_link', 'open_qr', 'open_other')
      and card_id is null
      and owner_id is null
    )
  ),
  constraint product_daily_counts_key unique (day, action, card_key)
);

create index if not exists product_daily_counts_day_idx
  on public.product_daily_counts (day);

alter table public.product_daily_counts enable row level security;

create index if not exists product_daily_counts_owner_idx
  on public.product_daily_counts (owner_id);

create table if not exists public.product_count_objections (
  owner_id uuid primary key,
  objected_at timestamptz not null default now()
);

alter table public.product_count_objections enable row level security;

revoke all on table public.product_daily_counts from public, anon, authenticated;
grant select, insert, update, delete on table public.product_daily_counts to service_role;

revoke all on table public.product_count_objections from public, anon, authenticated;
grant select, insert, update, delete on table public.product_count_objections to service_role;

-- One lock per account so an objection and a new total cannot pass each other.
-- A total with no account skips the lock and still increments atomically.
create or replace function public.bump_product_count(
  p_day date,
  p_action text,
  p_card_id uuid,
  p_owner_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_owner_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text, 0));
    if exists (
      select 1 from public.product_count_objections where owner_id = p_owner_id
    ) then
      return;
    end if;
  end if;

  insert into public.product_daily_counts as counted (day, action, card_id, owner_id, total)
  values (p_day, p_action, p_card_id, p_owner_id, 1)
  on conflict on constraint product_daily_counts_key
  do update set total = counted.total + 1;
end;
$$;

create or replace function public.object_to_product_counts(p_owner_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_owner_id is null then
    return;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text, 0));
  insert into public.product_count_objections (owner_id)
  values (p_owner_id)
  on conflict (owner_id) do nothing;
  delete from public.product_daily_counts where owner_id = p_owner_id;
end;
$$;

revoke all on function public.bump_product_count(date, text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.object_to_product_counts(uuid) from public, anon, authenticated;
grant execute on function public.bump_product_count(date, text, uuid, uuid) to service_role;
grant execute on function public.object_to_product_counts(uuid) to service_role;

-- Operator report. This is not available to a signed-in account.
-- select day, action, card_id, owner_id, total
-- from public.product_daily_counts
-- where day >= current_date - 90
-- order by day desc, action;
