-- ============================================================
-- Compass — the code in a coded handle is unique.
-- Supabase → SQL Editor → New query.
-- Paste the CONTENTS of this file (Cmd+A, Cmd+C), not the file name.
--
-- A coded handle is `code-slug`. The code is the part before the first `-`:
-- 7 signs on new cards, 3 on cards already given out. It has a letter and a digit.
-- `/@anna` and `/@anna-2` are not codes. This file does not add a column.
--
-- The app does not apply this file. Until it runs, two cards can share a code.
-- Opening an old address then finds none, or more than one, and says the
-- portfolio is gone. New codes are already 7 signs.
--
-- 1. Run the select first. If it returns any row, stop and send the result.
--    Do not create the index while those codes are shared.
-- 2. Run the index only when the select returned no rows.
-- ============================================================

select split_part(lower(btrim(handle)), '-', 1) as code, count(*) as cards
from public.cards
where handle is not null
  and length(btrim(handle)) > 0
  and length(split_part(btrim(handle), '-', 1)) in (3, 7)
  and split_part(lower(btrim(handle)), '-', 1) ~ '[a-z]'
  and split_part(lower(btrim(handle)), '-', 1) ~ '[23456789]'
  and lower(btrim(handle)) ~ '^[abcdefghjkmnpqrstuvwxyz23456789]+-[a-z0-9]+$'
group by 1
having count(*) > 1
order by cards desc, code;

create unique index if not exists cards_handle_code_unique
  on public.cards (lower(split_part(btrim(handle), '-', 1)))
  where handle is not null
    and length(btrim(handle)) > 0
    and length(split_part(btrim(handle), '-', 1)) in (3, 7)
    and split_part(lower(btrim(handle)), '-', 1) ~ '[a-z]'
    and split_part(lower(btrim(handle)), '-', 1) ~ '[23456789]'
    and lower(btrim(handle)) ~ '^[abcdefghjkmnpqrstuvwxyz23456789]+-[a-z0-9]+$';
