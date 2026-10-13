-- =============================================================================
-- Compass — Phase N: who's going
-- =============================================================================
-- Guests on an event see "34 going ›" under the poster and the cards of
-- those who allow connections. The organiser can switch it off in the
-- cabinet: Guests see who's going · on / off. On by default.
-- Until this runs, the app reads every event as on and the switch does not save.
-- =============================================================================

alter table public.events
  add column if not exists show_going boolean not null default true;
