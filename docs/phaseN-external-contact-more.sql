-- Compass — manual contact More: Web, Social, About, and private files.
-- Supabase → SQL Editor → New query. Paste this file. Run once. Safe to run again.
-- The app does not apply this file. Until it runs, a short Save still works.
-- A Save that includes these fields does not write anything if the columns are missing.
--
-- Bucket contact-files is private, 50 MB, no storage policies.
-- The service role writes it. Readers use the contact route, not /f.

insert into storage.buckets (id, name, public, file_size_limit)
values ('contact-files', 'contact-files', false, 52428800)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit;

alter table public.external_contacts add column if not exists web jsonb;
alter table public.external_contacts add column if not exists social jsonb;
alter table public.external_contacts add column if not exists about text;
alter table public.external_contacts add column if not exists files jsonb;

update public.external_contacts set web = '[]'::jsonb where web is null;
update public.external_contacts set social = '[]'::jsonb where social is null;
update public.external_contacts set about = '' where about is null;
update public.external_contacts set files = '[]'::jsonb where files is null;

alter table public.external_contacts alter column web set default '[]'::jsonb;
alter table public.external_contacts alter column social set default '[]'::jsonb;
alter table public.external_contacts alter column about set default '';
alter table public.external_contacts alter column files set default '[]'::jsonb;

alter table public.external_contacts alter column web set not null;
alter table public.external_contacts alter column social set not null;
alter table public.external_contacts alter column about set not null;
alter table public.external_contacts alter column files set not null;

alter table public.external_contacts drop constraint if exists external_contacts_web_array;
alter table public.external_contacts
  add constraint external_contacts_web_array
  check (jsonb_typeof(web) = 'array' and jsonb_array_length(web) <= 12);

alter table public.external_contacts drop constraint if exists external_contacts_social_array;
alter table public.external_contacts
  add constraint external_contacts_social_array
  check (jsonb_typeof(social) = 'array' and jsonb_array_length(social) <= 12);

alter table public.external_contacts drop constraint if exists external_contacts_about_len;
alter table public.external_contacts
  add constraint external_contacts_about_len
  check (char_length(about) <= 2000);

alter table public.external_contacts drop constraint if exists external_contacts_files_array;
alter table public.external_contacts
  add constraint external_contacts_files_array
  check (jsonb_typeof(files) = 'array' and jsonb_array_length(files) <= 8);
