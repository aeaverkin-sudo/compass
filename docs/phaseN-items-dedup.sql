-- ============================================================
-- Compass — one line per owner in the item pool
-- Supabase → SQL Editor → New query.
-- Paste the CONTENTS of this file (Cmd+A, Cmd+C), not the file name.
-- Safe to run again. One transaction: an error leaves everything as it was.
--
-- A line is the same stored file, or the same words of one text type in any case
-- ("Solo founder" = "Solo  Founder"). Files without a stored copy are not compared:
-- two photos may share a file name.
--
-- 1. Each group of identical rows keeps one: the row on most cards, then the lowest id.
-- 2. Card links, opens and card sections of the others move to the kept row.
--    A card that had both keeps one link, at the higher place, visible if either was.
-- 3. A file whose upload never finished goes when the same file name finished for that owner.
-- 4. Two unique indexes keep it so. The app joins a refused row to the existing one.
-- The app does not apply this file.
-- ============================================================

begin;

create temporary table item_twins on commit drop as
with keyed as (
  select
    i.id,
    i.owner_id,
    case
      when i.attachment_id is not null then 'file:' || i.attachment_id::text
      else i.type || ':' || lower(btrim(regexp_replace(i.value, '\s+', ' ', 'g')))
    end as line,
    (select count(*) from public.card_items ci where ci.item_id = i.id) as cards
  from public.items i
  where i.attachment_id is not null
     or (
       i.type not in ('pdf', 'photo', 'presentation', 'document', 'spreadsheet', 'audio', 'video')
       and btrim(regexp_replace(i.value, '\s+', ' ', 'g')) <> ''
     )
), ranked as (
  select id, first_value(id) over (partition by owner_id, line order by cards desc, id) as keep
  from keyed
)
select id, keep from ranked where id <> keep;

create temporary table unfinished_files on commit drop as
select f.id
from public.items f
where f.attachment_id is null
  and f.url = ''
  and f.type in ('pdf', 'photo', 'presentation', 'document', 'spreadsheet', 'audio', 'video')
  and exists (
    select 1 from public.items s
    where s.owner_id = f.owner_id
      and s.type = f.type
      and s.attachment_id is not null
      and lower(btrim(s.value)) = lower(btrim(f.value))
  );

-- 2a. A card that holds the kept row too: the kept link takes the higher place.
update public.card_items k
set sort_order = least(k.sort_order, m.sort_order),
    visible = k.visible or m.visible
from (
  select d.card_id, t.keep, min(d.sort_order) as sort_order, bool_or(d.visible) as visible
  from public.card_items d
  join item_twins t on t.id = d.item_id
  group by d.card_id, t.keep
) m
where k.card_id = m.card_id and k.item_id = m.keep;

delete from public.card_items d
using item_twins t
where d.item_id = t.id
  and exists (select 1 from public.card_items k where k.card_id = d.card_id and k.item_id = t.keep);

-- 2b. Several copies on a card without the kept row: the highest one stays and is moved.
delete from public.card_items d
using item_twins t
where d.item_id = t.id
  and exists (
    select 1
    from public.card_items o
    join item_twins ot on ot.id = o.item_id
    where o.card_id = d.card_id
      and ot.keep = t.keep
      and (o.sort_order, o.id) < (d.sort_order, d.id)
  );

update public.card_items d
set item_id = t.keep
from item_twins t
where d.item_id = t.id;

update public.card_events e
set item_id = t.keep
from item_twins t
where e.item_id = t.id;

-- 2c. Card sections keyed by row id. The kept row's own section wins.
update public.cards c
set item_zones = (
  select coalesce(jsonb_object_agg(coalesce(t.keep::text, z.key), z.value order by (t.keep is null)), '{}'::jsonb)
  from jsonb_each(c.item_zones) z
  left join item_twins t on t.id::text = z.key
)
where c.item_zones is not null
  and exists (select 1 from jsonb_each(c.item_zones) z join item_twins t on t.id::text = z.key);

delete from public.items i using item_twins t where i.id = t.id;

-- 3.
delete from public.card_items d using unfinished_files f where d.item_id = f.id;
delete from public.items i using unfinished_files f where i.id = f.id;

-- 4.
create unique index if not exists items_owner_line_key
  on public.items (owner_id, type, lower(btrim(regexp_replace(value, '\s+', ' ', 'g'))))
  where attachment_id is null
    and type not in ('pdf', 'photo', 'presentation', 'document', 'spreadsheet', 'audio', 'video')
    and btrim(regexp_replace(value, '\s+', ' ', 'g')) <> '';

create unique index if not exists items_owner_attachment_key
  on public.items (owner_id, attachment_id)
  where attachment_id is not null;

commit;

-- Check: both counts are 0.
-- select count(*) from (
--   select owner_id, type, lower(btrim(regexp_replace(value, '\s+', ' ', 'g')))
--   from public.items
--   where attachment_id is null
--     and type not in ('pdf', 'photo', 'presentation', 'document', 'spreadsheet', 'audio', 'video')
--     and btrim(regexp_replace(value, '\s+', ' ', 'g')) <> ''
--   group by 1, 2, 3 having count(*) > 1
-- ) twins;
-- select count(*) from (
--   select owner_id, attachment_id from public.items where attachment_id is not null group by 1, 2 having count(*) > 1
-- ) files;
