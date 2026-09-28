-- ============================================================
-- Compass — Phase 8: at least one public portfolio
-- Supabase → SQL Editor → New query.
-- Paste the CONTENTS of this file (Cmd+A, Cmd+C), not the file name.
-- Run once. Safe to run again.
--
-- Replaces the phase 7 trigger, which locked the earliest card public.
-- Any portfolio may be public or private. The database refuses to turn
-- off the last public one: that write is kept, and listed is put back
-- to true, so a name or photo save on the same row still lands.
--
-- Run this file on its own if phase 7 has not been applied.
-- If phase 7 was already applied, run this after it.
-- Do not run phase 7 after this file — it would put the old trigger back.
-- The app does not apply this file.
-- ============================================================

alter table public.cards
  add column if not exists listed boolean;

-- Only rows that do not have a value yet. A second run does not
-- reset a portfolio the owner has already switched.
update public.cards as card
set listed = (
  card.id = (
    select earliest.id
    from public.cards as earliest
    where earliest.owner_id = card.owner_id
    order by earliest.created_at asc, earliest.id asc
    limit 1
  )
)
where card.listed is null;

-- An owner with no public portfolio gets the earliest one turned back on.
update public.cards as card
set listed = true
where card.listed is not true
  and card.id = (
    select earliest.id
    from public.cards as earliest
    where earliest.owner_id = card.owner_id
    order by earliest.created_at asc, earliest.id asc
    limit 1
  )
  and not exists (
    select 1
    from public.cards as other
    where other.owner_id = card.owner_id
      and other.listed is true
  );

alter table public.cards
  alter column listed set default true;

alter table public.cards
  alter column listed set not null;

drop trigger if exists cards_keep_main_listed on public.cards;
drop function if exists public.keep_main_card_listed();

create or replace function public.keep_at_least_one_listed()
returns trigger
language plpgsql
as $$
begin
  if new.listed is true then
    return new;
  end if;

  -- Another portfolio of this owner is already public. This one may be private.
  if exists (
    select 1
    from public.cards
    where owner_id = new.owner_id
      and id <> new.id
      and listed is true
  ) then
    return new;
  end if;

  -- This write would leave the owner with nothing public.
  new.listed := true;
  return new;
end;
$$;

drop trigger if exists cards_keep_at_least_one_listed on public.cards;
create trigger cards_keep_at_least_one_listed
  before insert or update on public.cards
  for each row execute function public.keep_at_least_one_listed();
