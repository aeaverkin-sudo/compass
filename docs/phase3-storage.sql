-- ============================================================
-- Compass — Phase 3: storage
-- Supabase → SQL Editor → Run. Safe to run again.
-- card_items.attachment_id from phase 1 stays unused.
-- items.attachment_id is added later in this file, on the pool row.
-- ============================================================

-- 0. Public flag. Not exposed yet. First card is public, extra cards are not.
alter table public.cards
  add column if not exists is_public boolean not null default false;
