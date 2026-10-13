-- ТЗ 42 comments §1: the poster snapshot for the event mails.
-- The PNG lives in the public bucket event-posters as {event_id}.png; the server writes it with the service key.

alter table public.events add column if not exists poster_path text;
alter table public.events add column if not exists poster_updated_at timestamptz;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-posters', 'event-posters', true, 5242880, array['image/png'])
on conflict (id) do update set public = true;
