-- ============================================================
-- Compass — email signup code, before the account exists
-- Supabase → SQL Editor → Run once. Safe to run again.
--
-- The app does not apply this file. Service role only.
-- The password is not stored. The code is only a sha256 hash.
-- email_hash and ip_hash are HMAC-SHA256 with MAIL_HASH_SECRET.
-- The address and the IP are not stored.
-- No edge address stores an empty ip_hash and is not counted by IP.
-- A signup letter is counted for the address. A request is
-- counted for the IP. Reset requests count even when no
-- letter goes out, so the answer stays the same.
-- ============================================================

create table if not exists public.email_signup_codes (
  email text primary key,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  sent_at timestamptz not null default now()
);

alter table public.email_signup_codes enable row level security;
revoke all on table public.email_signup_codes from anon, authenticated;

create table if not exists public.auth_mail_sends (
  id uuid primary key default gen_random_uuid(),
  email_hash text not null,
  ip_hash text not null,
  kind text not null check (kind in ('signup', 'reset')),
  sent boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists auth_mail_sends_email
  on public.auth_mail_sends (email_hash, created_at);

create index if not exists auth_mail_sends_ip
  on public.auth_mail_sends (ip_hash, created_at);

alter table public.auth_mail_sends enable row level security;
revoke all on table public.auth_mail_sends from anon, authenticated;
