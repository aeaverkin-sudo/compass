-- ============================================================
-- Compass — Phase N0b: do not save your own card
-- Supabase → SQL Editor → New query.
-- Paste the CONTENTS of this file (Cmd+A, Cmd+C), not the file name.
-- Run once. Safe to run again.
--
-- After N0. The stamp still fills the owner and the token.
-- A row whose owner is also the saved card's owner is refused.
-- The app does not apply this file.
-- ============================================================

create or replace function public.connections_stamp_card()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  card public.cards%rowtype;
begin
  select * into card from public.cards where id = new.saved_card_id;
  if not found then
    raise exception 'saved_card_missing' using errcode = 'P0001';
  end if;
  new.saved_owner_id := card.owner_id;
  new.saved_card_token := card.public_token;
  if new.saved_owner_id = new.owner_id then
    raise exception 'cannot_save_own_card' using errcode = 'P0001';
  end if;
  if tg_op = 'INSERT' and btrim(new.display_name) = '' then
    new.display_name := card.display_name;
  end if;
  return new;
end;
$$;

revoke all on function public.connections_stamp_card() from public;
revoke all on function public.connections_stamp_card() from anon;
revoke all on function public.connections_stamp_card() from authenticated;
