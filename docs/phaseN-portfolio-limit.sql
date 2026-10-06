-- ============================================================
-- Compass — personal portfolio ceiling
-- Supabase → SQL Editor → New query.
-- Paste the CONTENTS of this file (Cmd+A, Cmd+C), not the file name.
-- Safe to run again.
--
-- NULL means "use the plan" (free 3, paid 10). A number overrides the
-- portfolio count only. Storage stays on the plan.
-- The app does not apply this file.
-- ============================================================

alter table public.profiles
  add column if not exists portfolio_limit integer;

-- phase9 attaches cards_portfolio_limit to this function. Replacing the
-- function updates that trigger. This file does not create a second one.
create or replace function public.enforce_portfolio_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_plan text;
  override integer;
  lim integer;
  existing integer;
begin
  -- Upsert of a portfolio that is already stored fires this insert trigger
  -- before the conflict update. Counting that row would reject a photo save
  -- on the last free slot and the client would drop the portfolio.
  if exists (select 1 from public.cards where id = new.id) then
    return new;
  end if;

  select plan, portfolio_limit into current_plan, override
  from public.profiles
  where id = new.owner_id;

  if override is not null and override > 0 then
    lim := override;
  else
    lim := case when current_plan = 'paid' then 10 else 3 end;
  end if;

  select count(*)::integer into existing from public.cards where owner_id = new.owner_id;
  if existing >= lim then
    raise exception 'portfolio_limit' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- One account. Everyone else keeps the plan ceiling.
update public.profiles
set portfolio_limit = 5
where id = (select id from auth.users where email = 'radiomir70@gmail.com');
