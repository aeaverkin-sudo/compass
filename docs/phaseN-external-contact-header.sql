-- ============================================================
-- Compass — external contact: which field sits under the name
-- Supabase → SQL Editor → New query.
-- Paste the CONTENTS of this file. Safe to run again.
--
-- The app does not apply this file. Until it runs, Save still
-- works; the header choice is kept only for the open form.
-- ============================================================

alter table public.external_contacts
  add column if not exists header_field text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'external_contacts_header_field_check'
      and conrelid = 'public.external_contacts'::regclass
  ) then
    alter table public.external_contacts
      add constraint external_contacts_header_field_check
      check (header_field is null or header_field in ('position', 'company'));
  end if;
end $$;
