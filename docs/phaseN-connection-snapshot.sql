-- ============================================================
-- Compass — Phase N: a deleted guest stays in the books that saved them
-- Supabase → SQL Editor → New query.
-- Paste the CONTENTS of this file (Cmd+A, Cmd+C), not the file name.
-- Run once. Safe to run again.
--
-- After phaseN0-connections.sql and phaseN0b-no-self-save.sql.
--
-- Before a trial or event pass account is deleted, the cron copies each
-- of its saved cards into the books that hold it: snapshot is the card's
-- rows at that moment (captions and values, no files, no photo), and
-- saved_card_deleted_at marks the moment. display_name is already there.
--
-- Until now the row went with the card (on delete cascade). From here
-- the card and its owner leave the row as null, and the row stays.
-- Network opens it read only, with "Profile deleted" instead of Save.
-- Until this runs, the deletion works as before and the row goes.
-- ============================================================

alter table public.connections
  add column if not exists snapshot jsonb,
  add column if not exists saved_card_deleted_at timestamptz;

alter table public.connections alter column saved_card_id drop not null;
alter table public.connections alter column saved_owner_id drop not null;

alter table public.connections drop constraint if exists connections_saved_card_id_fkey;
alter table public.connections
  add constraint connections_saved_card_id_fkey
  foreign key (saved_card_id) references public.cards(id) on delete set null;

alter table public.connections drop constraint if exists connections_saved_owner_id_fkey;
alter table public.connections
  add constraint connections_saved_owner_id_fkey
  foreign key (saved_owner_id) references public.profiles(id) on delete set null;

-- The stamp still fills the owner and the token from a live card.
-- A row whose card is gone keeps what it has: the delete itself
-- sets the card to null, and Accept may still touch the row later.
create or replace function public.connections_stamp_card()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  card public.cards%rowtype;
begin
  if new.saved_card_id is null then
    if tg_op = 'INSERT' then
      raise exception 'saved_card_missing' using errcode = 'P0001';
    end if;
    return new;
  end if;
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

create index if not exists connections_owner_token
  on public.connections (owner_id, saved_card_token);
