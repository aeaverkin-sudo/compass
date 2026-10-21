-- ============================================================
-- Compass — Wallet device registrations
-- Supabase → SQL Editor → Run once. Safe to run again.
--
-- One row per pass on a device. The serial keeps its slot suffix
-- (`person-{owner}-2`). Service role only.
-- ============================================================

create table if not exists public.wallet_pass_devices (
  device      text not null,
  serial      text not null,
  push_token  text not null,
  owner_id    uuid not null,
  updated_at  timestamptz not null default now(),
  primary key (device, serial)
);

alter table public.wallet_pass_devices enable row level security;

create index if not exists wallet_pass_devices_serial
  on public.wallet_pass_devices (serial);
