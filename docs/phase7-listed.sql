-- ============================================================
-- Compass — Phase 7: listed (Public / Private)
-- Supabase → SQL Editor → New query.
-- Paste the CONTENTS of this file (Cmd+A, Cmd+C), not the file name.
-- Run once. Safe to run again.
--
-- listed = true  → Public. People you've connected with can see it
--                  behind your other cards, and find it in search.
-- listed = false → Private. Direct link and QR only.
-- The first card of each owner stays Public. The database puts it back
-- if a client tries to turn it off. A later card may be either.
-- The app does not apply this file.
-- ============================================================

alter table public.cards
  add column if not exists listed boolean;

-- Only rows that do not have a value yet. A second run does not
-- reset a card the owner has already switched.
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

alter table public.cards
  alter column listed set default true;

alter table public.cards
  alter column listed set not null;

create or replace function public.keep_main_card_listed()
returns trigger
language plpgsql
as $$
declare
  main_id uuid;
begin
  select id into main_id
  from public.cards
  where owner_id = new.owner_id
  order by created_at asc, id asc
  limit 1;

  if new.id = main_id then
    new.listed := true;
  end if;

  return new;
end;
$$;

drop trigger if exists cards_keep_main_listed on public.cards;
create trigger cards_keep_main_listed
  before insert or update on public.cards
  for each row execute function public.keep_main_card_listed();
