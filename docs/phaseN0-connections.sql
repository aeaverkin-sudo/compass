-- ============================================================
-- Compass — Phase N0: contact book
-- Supabase → SQL Editor → New query.
-- Paste the CONTENTS of this file (Cmd+A, Cmd+C), not the file name.
-- Run once. Safe to run again.
--
-- connections is one person's book. A row is visible, inserted,
-- updated, and deleted only when owner_id is the signed-in user.
-- Accept (pending → active) is that update.
-- The share-back row belongs to the other person, so the browser
-- cannot insert it. The server writes it with the service role.
--
-- The beacon is a count only. The function is not granted to the
-- browser, so a person cannot read who saved them, only the server
-- can ask for the number.
--
-- source_event_id has no event table yet. Block 4 owns events.
-- The app does not apply this file.
-- ============================================================

create table if not exists public.connections (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references public.profiles(id) on delete cascade,
  saved_card_id    uuid not null references public.cards(id) on delete cascade,
  saved_card_token text not null,
  saved_owner_id   uuid not null references public.profiles(id) on delete cascade,
  display_name     text not null default '',
  state            text not null check (state in ('active', 'pending')),
  source_event_id  uuid,
  note             text,
  created_at       timestamptz not null default now()
);

create unique index if not exists connections_owner_card_unique
  on public.connections (owner_id, saved_card_id);

create index if not exists connections_owner_created
  on public.connections (owner_id, created_at);

create index if not exists connections_saved_owner
  on public.connections (saved_owner_id);

-- Token and owner come from the card itself. The name snapshot stays
-- once it is set, so a later rename of the card does not rewrite the book.
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
  if tg_op = 'INSERT' and btrim(new.display_name) = '' then
    new.display_name := card.display_name;
  end if;
  return new;
end;
$$;

revoke all on function public.connections_stamp_card() from public;
revoke all on function public.connections_stamp_card() from anon;
revoke all on function public.connections_stamp_card() from authenticated;

drop trigger if exists connections_stamp_card on public.connections;
create trigger connections_stamp_card
  before insert or update on public.connections
  for each row execute function public.connections_stamp_card();

alter table public.connections enable row level security;

drop policy if exists "own connections" on public.connections;
create policy "own connections" on public.connections
  for select using (owner_id = auth.uid());

drop policy if exists "insert own connection" on public.connections;
create policy "insert own connection" on public.connections
  for insert with check (owner_id = auth.uid());

drop policy if exists "update own connection" on public.connections;
create policy "update own connection" on public.connections
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "delete own connection" on public.connections;
create policy "delete own connection" on public.connections
  for delete using (owner_id = auth.uid());

-- How many people saved me. Rows stay on the server.
create or replace function public.connection_save_count(subject uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.connections
  where saved_owner_id = subject;
$$;

revoke all on function public.connection_save_count(uuid) from public;
revoke all on function public.connection_save_count(uuid) from anon;
revoke all on function public.connection_save_count(uuid) from authenticated;
grant execute on function public.connection_save_count(uuid) to service_role;

-- One primary card per owner. The earliest card is primary until a
-- later write chooses another. Clearing the last primary puts it back.
alter table public.cards
  add column if not exists is_primary boolean;

update public.cards as card
set is_primary = (
  card.id = (
    select earliest.id
    from public.cards as earliest
    where earliest.owner_id = card.owner_id
    order by earliest.created_at asc, earliest.id asc
    limit 1
  )
)
where card.is_primary is null;

alter table public.cards
  alter column is_primary set default false;

alter table public.cards
  alter column is_primary set not null;

create unique index if not exists cards_one_primary_per_owner
  on public.cards (owner_id)
  where is_primary;

create or replace function public.keep_one_primary_card()
returns trigger
language plpgsql
as $$
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  if tg_op = 'INSERT' and not exists (
    select 1 from public.cards where owner_id = new.owner_id
  ) then
    new.is_primary := true;
  end if;

  if new.is_primary is true then
    update public.cards
    set is_primary = false
    where owner_id = new.owner_id
      and id <> new.id
      and is_primary is true;
    return new;
  end if;

  if not exists (
    select 1
    from public.cards
    where owner_id = new.owner_id
      and id <> new.id
      and is_primary is true
  ) then
    new.is_primary := true;
  end if;

  return new;
end;
$$;

drop trigger if exists cards_keep_one_primary on public.cards;
create trigger cards_keep_one_primary
  before insert or update on public.cards
  for each row execute function public.keep_one_primary_card();
