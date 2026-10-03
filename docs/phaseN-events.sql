-- ============================================================
-- Compass — Phase N: events
-- Supabase → SQL Editor → New query.
-- Paste the CONTENTS of this file (Cmd+A, Cmd+C), not the file name.
-- Run once. Safe to run again.
--
-- events is one organiser's event. A row is visible, inserted,
-- updated, and deleted only when owner_id is the signed-in user.
-- The invite is not a list. event_invite(lookup) returns the one
-- row whose public_token or code matches. It hides a secret place.
--
-- event_registrations: a participant reads their own row.
-- Check-in and the organiser's counts are written by the server
-- with the service role. There is no browser policy for that.
--
-- The app does not apply this file.
-- ============================================================

create table if not exists public.events (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid not null references public.profiles(id) on delete cascade,
  name               text not null,
  logo_attachment_id uuid references public.attachments(id) on delete set null,
  description        text,
  date               timestamptz,
  place              text,
  place_secret       boolean not null default false,
  theme              text not null default 'paper'
                       check (theme in ('paper', 'noir', 'sky', 'butter', 'peach', 'lilac', 'mint', 'clay')),
  public_token       text not null,
  code               text not null,
  created_at         timestamptz not null default now(),
  constraint events_public_token_key unique (public_token),
  constraint events_code_key unique (code),
  constraint events_public_token_shape check (public_token ~ '^[A-Za-z0-9_-]{21}$'),
  constraint events_code_shape check (code ~ '^[А-Я0-9]{4,6}$')
);

create index if not exists events_owner_created
  on public.events (owner_id, created_at);

-- Retired cover names from the first draft. A second paste of this file
-- replaces the theme check with the eight invite colours.
update public.events
set theme = case theme
  when 'ink' then 'noir'
  when 'night' then 'noir'
  else 'paper'
end
where theme not in ('paper', 'noir', 'sky', 'butter', 'peach', 'lilac', 'mint', 'clay');

do $$
declare
  cons name;
begin
  for cons in
    select conname
    from pg_constraint
    where conrelid = 'public.events'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%theme%'
  loop
    execute format('alter table public.events drop constraint %I', cons);
  end loop;
end $$;

alter table public.events
  add constraint events_theme_check
  check (theme in ('paper', 'noir', 'sky', 'butter', 'peach', 'lilac', 'mint', 'clay'));

create table if not exists public.event_registrations (
  id                 uuid primary key default gen_random_uuid(),
  event_id           uuid not null references public.events(id) on delete cascade,
  user_id            uuid not null references public.profiles(id) on delete cascade,
  card_id            uuid not null references public.cards(id) on delete cascade,
  reg_token          text not null,
  checked_in_at      timestamptz,
  consent_analytics  boolean not null default false,
  consent_connections boolean not null default false,
  created_at         timestamptz not null default now(),
  constraint event_registrations_reg_token_key unique (reg_token),
  constraint event_registrations_event_user_key unique (event_id, user_id),
  constraint event_registrations_reg_token_shape check (reg_token ~ '^[A-Za-z0-9_-]{21}$')
);

create index if not exists event_registrations_event
  on public.event_registrations (event_id);

-- The badge card belongs to the participant.
create or replace function public.event_registrations_stamp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  card_owner uuid;
begin
  select owner_id into card_owner from public.cards where id = new.card_id;
  if card_owner is distinct from new.user_id then
    raise exception 'card_not_yours' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.event_registrations_stamp() from public;
revoke all on function public.event_registrations_stamp() from anon;
revoke all on function public.event_registrations_stamp() from authenticated;

drop trigger if exists event_registrations_stamp on public.event_registrations;
create trigger event_registrations_stamp
  before insert or update of card_id, user_id on public.event_registrations
  for each row execute function public.event_registrations_stamp();

alter table public.events enable row level security;
alter table public.event_registrations enable row level security;

drop policy if exists "own events" on public.events;
create policy "own events" on public.events
  for select using (owner_id = auth.uid());

drop policy if exists "insert own event" on public.events;
create policy "insert own event" on public.events
  for insert with check (owner_id = auth.uid());

drop policy if exists "update own event" on public.events;
create policy "update own event" on public.events
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "delete own event" on public.events;
create policy "delete own event" on public.events
  for delete using (owner_id = auth.uid());

drop policy if exists "own registration" on public.event_registrations;
create policy "own registration" on public.event_registrations
  for select using (user_id = auth.uid());

drop policy if exists "insert own registration" on public.event_registrations;
create policy "insert own registration" on public.event_registrations
  for insert with check (user_id = auth.uid());

-- One invite. Lookup is a public token or a short code, never a list.
create or replace function public.event_invite(lookup text)
returns table (
  id uuid,
  name text,
  logo_attachment_id uuid,
  description text,
  date timestamptz,
  place text,
  place_secret boolean,
  theme text,
  public_token text,
  code text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if lookup is null or char_length(lookup) < 4 or char_length(lookup) > 64 then
    return;
  end if;

  return query
  select
    e.id,
    e.name,
    e.logo_attachment_id,
    e.description,
    e.date,
    case when e.place_secret then null else e.place end,
    e.place_secret,
    e.theme,
    e.public_token,
    e.code
  from public.events as e
  where e.public_token = lookup or e.code = lookup
  limit 1;
end;
$$;

revoke all on function public.event_invite(text) from public;
grant execute on function public.event_invite(text) to anon, authenticated, service_role;
