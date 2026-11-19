-- Compass — external contacts (collected by hand, scan, later voice and photo).
-- Supabase → SQL Editor → New query. Paste this file. Run once. Safe to run again.
-- The app does not apply this file.
-- A missing table is not an error for Network: the app hides "+".
-- Deletes of profiles cascade here. Deletes of cards and attachments only clear the link.

create table if not exists public.external_contacts (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references public.profiles(id) on delete cascade,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  display_name        text not null,
  photo_attachment_id uuid references public.attachments(id) on delete set null,
  position            text not null default '',
  company             text not null default '',
  note                text not null default '',
  event_tag           text not null default '',
  source              text not null default 'manual'
                        check (source in ('manual', 'scan', 'voice', 'photo')),
  lines               jsonb not null default '[]'::jsonb,
  pushback_at         timestamptz,
  pushback_channel    text check (pushback_channel in ('email', 'whatsapp', 'telegram')),
  pushback_card_id    uuid references public.cards(id) on delete set null,
  constraint external_contacts_name_present check (btrim(display_name) <> ''),
  constraint external_contacts_name_len check (char_length(display_name) <= 120),
  constraint external_contacts_position_len check (char_length(position) <= 160),
  constraint external_contacts_company_len check (char_length(company) <= 160),
  constraint external_contacts_note_len check (char_length(note) <= 500),
  constraint external_contacts_tag_len check (char_length(event_tag) <= 80),
  constraint external_contacts_lines_array check (
    jsonb_typeof(lines) = 'array' and jsonb_array_length(lines) <= 30
  )
);

create index if not exists external_contacts_owner_created
  on public.external_contacts (owner_id, created_at desc);

create or replace function public.external_contacts_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.external_contacts_touch() from public;
revoke all on function public.external_contacts_touch() from anon;
revoke all on function public.external_contacts_touch() from authenticated;

drop trigger if exists external_contacts_touch on public.external_contacts;
create trigger external_contacts_touch
  before update on public.external_contacts
  for each row execute function public.external_contacts_touch();

alter table public.external_contacts enable row level security;

drop policy if exists "own external contacts" on public.external_contacts;
create policy "own external contacts" on public.external_contacts
  for select using (owner_id = auth.uid());

drop policy if exists "insert own external contact" on public.external_contacts;
create policy "insert own external contact" on public.external_contacts
  for insert with check (owner_id = auth.uid());

drop policy if exists "update own external contact" on public.external_contacts;
create policy "update own external contact" on public.external_contacts
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "delete own external contact" on public.external_contacts;
create policy "delete own external contact" on public.external_contacts
  for delete using (owner_id = auth.uid());
