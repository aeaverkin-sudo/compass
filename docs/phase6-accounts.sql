-- ============================================================
-- Compass — Phase 6: accounts, consent, trial clock
-- Supabase → SQL Editor → Run once. Safe to run again.
--
-- The app does not apply this file. Service role writes the trial
-- columns and pending_email_signups. The browser cannot.
-- Deletion of an expired trial is the purge route, not a manual delete.
-- ============================================================

alter table public.profiles
  add column if not exists draft_expires_at timestamptz,
  add column if not exists purge_at timestamptz,
  add column if not exists registered_at timestamptz;

-- The anonymous client must not start, extend, or clear its own clock.
revoke update (draft_expires_at, purge_at, registered_at)
  on table public.profiles from anon, authenticated;

create table if not exists public.consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  document_version text not null,
  path text not null check (path in ('trial', 'register')),
  accepted_at timestamptz not null default now()
);

alter table public.consents enable row level security;

drop policy if exists "own consents" on public.consents;
create policy "own consents" on public.consents
  for select using (user_id = auth.uid());

drop policy if exists "insert own consent" on public.consents;
create policy "insert own consent" on public.consents
  for insert with check (user_id = auth.uid());

-- Starter code lives here as a hash until the person types it.
-- No policies: only the service role can read or write the table.
create table if not exists public.pending_email_signups (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  email text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.pending_email_signups enable row level security;

revoke all on table public.pending_email_signups from anon, authenticated;

-- Looks up an existing login without exposing auth.users to the browser.
create or replace function public.auth_user_id_by_email(address text)
returns uuid
language sql
security definer
set search_path = auth, public
as $$
  select id
  from auth.users
  where email is not null
    and lower(email) = lower(btrim(address))
  limit 1;
$$;

revoke all on function public.auth_user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.auth_user_id_by_email(text) to service_role;

-- Removes expired starter codes and expired unregistered trials.
-- The HTTP job calls this. Do not delete those rows by hand.
create or replace function public.purge_expired_trials()
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  removed integer := 0;
  doomed uuid;
begin
  delete from public.pending_email_signups
  where expires_at < now();

  for doomed in
    select id
    from public.profiles
    where registered_at is null
      and purge_at is not null
      and purge_at < now()
  loop
    delete from auth.users where id = doomed;
    removed := removed + 1;
  end loop;

  return removed;
end;
$$;

revoke all on function public.purge_expired_trials() from public, anon, authenticated;
grant execute on function public.purge_expired_trials() to service_role;
