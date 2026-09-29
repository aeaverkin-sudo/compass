-- ============================================================
-- Compass — Phase 9: plan column and portfolio ceiling
-- Supabase → SQL Editor → New query.
-- Paste the CONTENTS of this file (Cmd+A, Cmd+C), not the file name.
-- Run once. Safe to run again.
--
-- profiles.plan is the source of truth until Stripe exists.
-- The app does not apply this file. A person cannot set their own plan.
-- Portfolio counts match src/shared/services/plans.ts (free 3, paid 10).
-- ============================================================

alter table public.profiles
  add column if not exists plan text not null default 'free';

alter table public.profiles
  drop constraint if exists profiles_plan_check;

alter table public.profiles
  add constraint profiles_plan_check check (plan in ('free', 'paid'));

revoke update (plan) on table public.profiles from anon, authenticated;

create or replace function public.enforce_portfolio_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_plan text;
  lim integer;
  existing integer;
begin
  select plan into current_plan from public.profiles where id = new.owner_id;
  lim := case when current_plan = 'paid' then 10 else 3 end;
  select count(*)::integer into existing from public.cards where owner_id = new.owner_id;
  if existing >= lim then
    raise exception 'portfolio_limit' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists cards_portfolio_limit on public.cards;
create trigger cards_portfolio_limit
  before insert on public.cards
  for each row execute function public.enforce_portfolio_limit();
