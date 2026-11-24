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

revoke all on table public.product_daily_counts from public, anon, authenticated;
grant select, insert, update, delete on table public.product_daily_counts to service_role;

-- Operator report. This is not available to a signed-in account.
-- select day, action, card_id, owner_id, total
-- from public.product_daily_counts
-- where day >= current_date - 90
-- order by day desc, action;
