-- ============================================================
-- Compass — a deleted card id must not be inserted again.
-- Supabase → SQL Editor → New query.
-- Paste the CONTENTS of this file (Cmd+A, Cmd+C), not the file name.
-- Run once. Safe to run again.
--
-- The app does not apply this file. Until it runs, the phone never
-- sees this refusal and deletes nothing because of a missing card.
-- ============================================================

create table if not exists public.card_tombstones (
  card_id uuid primary key,
  owner_id uuid not null,
  deleted_at timestamptz not null default now()
);

create index if not exists card_tombstones_owner_idx
  on public.card_tombstones (owner_id);

alter table public.card_tombstones enable row level security;

revoke all on table public.card_tombstones from public, anon, authenticated;
grant select on table public.card_tombstones to authenticated;

drop policy if exists "own card tombstones" on public.card_tombstones;
create policy "own card tombstones"
  on public.card_tombstones
  for select
  using (owner_id = auth.uid());

create or replace function public.note_card_tombstone()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.card_tombstones (card_id, owner_id)
  values (old.id, old.owner_id)
  on conflict (card_id) do nothing;
  return old;
end;
$$;

create or replace function public.reject_card_tombstone()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.card_tombstones where card_id = new.id) then
    raise exception 'card_tombstone' using errcode = 'AD301';
  end if;
  return new;
end;
$$;

revoke all on function public.note_card_tombstone() from public, anon, authenticated;
revoke all on function public.reject_card_tombstone() from public, anon, authenticated;

drop trigger if exists cards_note_tombstone on public.cards;
create trigger cards_note_tombstone
  after delete on public.cards
  for each row execute function public.note_card_tombstone();

drop trigger if exists cards_block_tombstone on public.cards;
create trigger cards_block_tombstone
  before insert on public.cards
  for each row execute function public.reject_card_tombstone();
