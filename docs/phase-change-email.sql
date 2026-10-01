-- ============================================================
-- Compass — change email
-- Supabase → SQL Editor → Run once. Safe to run again.
--
-- The app does not apply this file. Service role writes the pending
-- row and the archive. The browser cannot.
-- email_history keeps the previous address. Nothing reads it yet.
-- ============================================================

alter table public.pending_email_signups
  add column if not exists purpose text not null default 'signup';

create table if not exists public.email_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  archived_at timestamptz not null default now()
);

alter table public.email_history enable row level security;

revoke all on table public.email_history from anon, authenticated;
