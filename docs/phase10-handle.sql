-- ============================================================
-- Compass — Phase 10: public @handle
-- Supabase → SQL Editor → New query.
-- Paste the CONTENTS of this file (Cmd+A, Cmd+C), not the file name.
-- Run once. Safe to run again.
--
-- adedme.com/@handle resolves to the same card as /c/{public_token}.
-- The app does not apply this file.
-- ============================================================

alter table public.cards
  add column if not exists handle text;

create unique index if not exists cards_handle_lower_unique
  on public.cards (lower(handle))
  where handle is not null and length(btrim(handle)) > 0;
