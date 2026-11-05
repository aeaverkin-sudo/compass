-- The welcome letter signs a person in until they change the password in Profile.
-- The raw token lives only in the letter. This table stores its hash.
-- The hash stays after the link is closed, so the same letter can open Sign In with the email.
-- Until this runs, the letter is not sent: the app refuses to store a token it cannot look up.
-- Supabase → SQL Editor → Run once. Safe to run again.

alter table public.profiles
  add column if not exists welcome_token_hash text,
  add column if not exists welcome_token_active boolean not null default true;

create unique index if not exists profiles_welcome_token_hash_idx
  on public.profiles (welcome_token_hash)
  where welcome_token_hash is not null;

revoke update (welcome_token_hash, welcome_token_active)
  on table public.profiles from anon, authenticated;
