-- ============================================================
-- Compass — Phase 3: storage
-- Supabase → SQL Editor → Run. Safe to run again.
-- card_items.attachment_id from phase 1 stays unused.
-- The live file pointer is items.attachment_id, on the pool row.
--
-- Dashboard, once, not SQL: Supabase → Project Settings → Storage →
-- Global file size limit must be at least 100 MB. The project default is
-- often 50 MB, and a lower plan may refuse 100 MB. The bucket limit below
-- cannot raise that project ceiling.
-- ============================================================

-- 0. Public flag. Not exposed yet. First card is public, extra cards are not.
alter table public.cards
  add column if not exists is_public boolean not null default false;

-- 1. File pointer on the pool row. One upload serves every card that links the item.
alter table public.items
  add column if not exists attachment_id uuid references public.attachments(id) on delete set null;

-- 2. Private buckets. No public or anon storage policies.
--    100 MB matches the showreel cap. Bytes are still only reachable
--    through the service role and signed URLs.
insert into storage.buckets (id, name, public, file_size_limit)
values
  ('card-attachments', 'card-attachments', false, 104857600),
  ('transfer-assets', 'transfer-assets', false, 104857600)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit;
