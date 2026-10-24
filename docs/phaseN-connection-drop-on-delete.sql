-- ============================================================
-- Compass — a deleted profile leaves other people's books
-- Supabase → SQL Editor → New query.
-- Paste the CONTENTS of this file (Cmd+A, Cmd+C), not the file name.
-- Run once. Safe to run again.
--
-- Replaces the "keep a Profile deleted row" link from
-- phaseN-connection-snapshot.sql. Deleting the card deletes the
-- book row. Deleting the account does the same.
-- The app does not apply this file.
-- ============================================================

alter table public.connections drop constraint if exists connections_saved_card_id_fkey;
alter table public.connections
  add constraint connections_saved_card_id_fkey
  foreign key (saved_card_id) references public.cards(id) on delete cascade;

alter table public.connections drop constraint if exists connections_saved_owner_id_fkey;
alter table public.connections
  add constraint connections_saved_owner_id_fkey
  foreign key (saved_owner_id) references public.profiles(id) on delete cascade;

-- Rows already left behind by a delete. The card is gone, so the book entry goes too.
delete from public.connections
where saved_card_id is null;
