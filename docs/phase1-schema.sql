-- ============================================================
-- Compass — Phase 1: schema + RLS
-- Paste the whole file into Supabase → SQL Editor → Run.
-- Safe to run again.
-- ============================================================

-- 1. profiles — one row per user (anonymous or email), id = auth id
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- A profile row is created when a user appears, including an anonymous one.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Profiles for users that already exist.
insert into public.profiles (id)
select id from auth.users
on conflict (id) do nothing;

-- 2. attachments — file record. The bytes go into Storage in a later phase.
create table if not exists public.attachments (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.profiles(id) on delete cascade,
  bucket        text not null,
  storage_path  text not null,
  mime          text not null,
  byte_size     integer not null,
  original_name text,
  created_at    timestamptz not null default now()
);

-- 3. cards. public_token is what the QR encodes: /c/{public_token}
create table if not exists public.cards (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references public.profiles(id) on delete cascade,
  display_name        text not null default '',
  title               text not null default '',
  photo_attachment_id uuid references public.attachments(id) on delete set null,
  status              text not null default 'draft'
                        check (status in ('draft','published','archived','suspended')),
  public_token        text not null unique,
  qr_version          integer not null default 1,
  item_order_manual   boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- 4. card_items — a line on the card (contact, link, file).
create table if not exists public.card_items (
  id            uuid primary key default gen_random_uuid(),
  card_id       uuid not null references public.cards(id) on delete cascade,
  type          text not null,
  label         text not null default '',
  value         text not null default '',
  url           text not null default '',
  attachment_id uuid references public.attachments(id) on delete set null,
  sort_order    integer not null default 0,
  visible       boolean not null default true,   -- hidden rows stay off the public card
  created_at    timestamptz not null default now()
);

-- 5. card_transfers — one-time handoff, "for the next scan only"
create table if not exists public.card_transfers (
  id             uuid primary key default gen_random_uuid(),
  card_id        uuid not null references public.cards(id) on delete cascade,
  transfer_token text not null unique,
  status         text not null default 'pending'
                   check (status in ('pending','consumed','expired')),
  consumed_at    timestamptz,
  expires_at     timestamptz not null default (now() + interval '24 hours'),
  created_at     timestamptz not null default now()
);

-- 6. transfer_items — what the one-time handoff carries (text, selfie, voice)
create table if not exists public.transfer_items (
  id            uuid primary key default gen_random_uuid(),
  transfer_id   uuid not null references public.card_transfers(id) on delete cascade,
  type          text not null check (type in ('text','voice','selfie')),
  content       text not null default '',
  attachment_id uuid references public.attachments(id) on delete set null,
  created_at    timestamptz not null default now()
);

-- 7. card_events — light private analytics
create table if not exists public.card_events (
  id         uuid primary key default gen_random_uuid(),
  card_id    uuid references public.cards(id) on delete cascade,
  type       text not null,
  created_at timestamptz not null default now()
);

-- Indexes.
create index if not exists idx_card_items_card     on public.card_items(card_id);
create index if not exists idx_attachments_owner   on public.attachments(owner_id);
create index if not exists idx_transfers_token     on public.card_transfers(transfer_token);
create index if not exists idx_cards_public_token  on public.cards(public_token);
create index if not exists idx_cards_owner         on public.cards(owner_id);

-- ============================================================
-- RLS — a person can read and change only their own rows.
-- There is no public anonymous read. The public card
-- is served by the server (service role), in a later phase.
-- ============================================================
alter table public.profiles       enable row level security;
alter table public.attachments    enable row level security;
alter table public.cards          enable row level security;
alter table public.card_items     enable row level security;
alter table public.card_transfers enable row level security;
alter table public.transfer_items enable row level security;
alter table public.card_events    enable row level security;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "own attachments" on public.attachments;
create policy "own attachments" on public.attachments
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "own cards" on public.cards;
create policy "own cards" on public.cards
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "own card_items" on public.card_items;
create policy "own card_items" on public.card_items
  for all
  using (exists (select 1 from public.cards c where c.id = card_id and c.owner_id = auth.uid()))
  with check (exists (select 1 from public.cards c where c.id = card_id and c.owner_id = auth.uid()));

drop policy if exists "own transfers" on public.card_transfers;
create policy "own transfers" on public.card_transfers
  for all
  using (exists (select 1 from public.cards c where c.id = card_id and c.owner_id = auth.uid()))
  with check (exists (select 1 from public.cards c where c.id = card_id and c.owner_id = auth.uid()));

drop policy if exists "own transfer_items" on public.transfer_items;
create policy "own transfer_items" on public.transfer_items
  for all
  using (exists (
    select 1 from public.card_transfers t
    join public.cards c on c.id = t.card_id
    where t.id = transfer_id and c.owner_id = auth.uid()))
  with check (exists (
    select 1 from public.card_transfers t
    join public.cards c on c.id = t.card_id
    where t.id = transfer_id and c.owner_id = auth.uid()));

drop policy if exists "own card_events" on public.card_events;
create policy "own card_events" on public.card_events
  for all
  using (exists (select 1 from public.cards c where c.id = card_id and c.owner_id = auth.uid()))
  with check (exists (select 1 from public.cards c where c.id = card_id and c.owner_id = auth.uid()));
