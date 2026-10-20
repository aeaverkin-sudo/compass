-- ============================================================
-- Compass — one-time notes: delete after delivery
-- Supabase → SQL Editor → Run once. Safe to run again.
--
-- A pending note waits 7 days. After the first viewer, the app
-- deletes the transfer rows at once and stamps delete_after on
-- the file. The purge cron removes those bytes an hour later.
-- ============================================================

alter table public.card_transfers
  alter column expires_at set default (now() + interval '7 days');

alter table public.attachments
  add column if not exists delete_after timestamptz;

create index if not exists idx_attachments_delete_after
  on public.attachments (delete_after)
  where delete_after is not null;
