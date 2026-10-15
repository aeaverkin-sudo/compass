-- One primary card per owner. Run once, in order.

-- 1. Owners with several primary cards keep the oldest one.
update public.cards c
set is_primary = false
where c.is_primary
  and exists (
    select 1 from public.cards o
    where o.owner_id = c.owner_id
      and o.is_primary
      and (o.created_at, o.id) < (c.created_at, c.id)
  );

-- 2. Owners without a primary card: the first one created becomes primary.
update public.cards c
set is_primary = true
where c.id in (
  select distinct on (owner_id) id
  from public.cards
  where owner_id not in (select owner_id from public.cards where is_primary)
  order by owner_id, created_at, id
);

-- 3. From now on the database refuses a second primary card.
create unique index if not exists cards_one_primary_per_owner on public.cards (owner_id) where is_primary;
