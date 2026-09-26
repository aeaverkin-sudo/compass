-- ============================================================
-- Compass — Phase 3: columns only
-- Supabase → SQL Editor → Run once. Safe to run again.
--
-- Buckets card-attachments and transfer-assets already exist:
-- private, 50 MB file_size_limit, no storage policies.
-- Do not insert buckets from this file.
--
-- card_items.attachment_id from phase 1 stays unused.
-- The live file pointer is items.attachment_id, on the pool row.
-- ============================================================

-- Public flag. Not exposed yet. First card is public, extra cards are not.
alter table public.cards
  add column if not exists is_public boolean not null default false;

-- File pointer on the pool row. One upload serves every card that links the item.
alter table public.items
  add column if not exists attachment_id uuid references public.attachments(id) on delete set null;
