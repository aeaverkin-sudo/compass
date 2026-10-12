-- ============================================================
-- Compass — the "ADED card" invite preset
-- Supabase → SQL Editor → New query.
-- Paste the CONTENTS of this file (Cmd+A, Cmd+C), not the file name.
-- Safe to run again.
--
-- layout 'card'  — the invite drawn as an ADED card
-- invite_rows    — every invite row in order, the three base rows included:
--                  [{ "id", "kind": "place" | "date" | "time" | "custom",
--                     "title", "number"?, "value"? }]
--                  Base rows keep their values in place, date and ends_at.
-- logo_look      — frame or shadow on the event photo; null is the plain square
-- The app does not apply this file. Until it is run, a card invite cannot be saved.
-- ============================================================

alter table public.events drop constraint if exists events_layout_check;
alter table public.events
  add constraint events_layout_check
  check (layout in ('card', 'grid', 'corners', 'oversized'));

alter table public.events add column if not exists invite_rows jsonb;

alter table public.events add column if not exists logo_look text
  check (logo_look in ('frame', 'shadow'));
