-- ============================================================
-- Compass — a card shared back can be refused
-- Supabase → SQL Editor → New query.
-- Paste the CONTENTS of this file (Cmd+A, Cmd+C), not the file name.
-- Run once. Safe to run again.
--
-- accept_share_back defaults on: the card arrives pending.
-- Off: share-back writes no row.
-- A pending row is not a receipt, so the save count ignores it.
-- The update policy on connections is already in phaseN0. Do not add it again.
-- The app does not apply this file.
-- ============================================================

alter table public.profiles
  add column if not exists accept_share_back boolean not null default true;

comment on column public.profiles.accept_share_back is
  'When false, a share-back creates no connection. When true, it arrives pending.';

create or replace function public.connection_save_count(subject uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.connections
  where saved_owner_id = subject
    and state = 'active';
$$;

revoke all on function public.connection_save_count(uuid) from public;
revoke all on function public.connection_save_count(uuid) from anon;
revoke all on function public.connection_save_count(uuid) from authenticated;
grant execute on function public.connection_save_count(uuid) to service_role;
