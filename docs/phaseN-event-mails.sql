-- =============================================================================
-- Compass — Phase N: event mails (TZ 42)
-- =============================================================================
-- reminder_enabled / reminder_sent_at: one reminder 24 hours before the start.
-- The cron stamps reminder_sent_at before it sends, so two runs never send twice.
--
-- event_guests.bounced_at: Resend reported a bounce or a complaint. No more
-- mail to this guest. last_mail_error: the last Resend error; the guest stays
-- Not sent.
--
-- event_mail_log: one row per mail (invite, reminder, deletion). The row is
-- written before the send and removed if Resend refuses, so a second tap on
-- SEND never mails the same guest twice. provider_id is the Resend email id,
-- which the webhook uses to find the guest. RLS on, no policy: server only.
--
-- Until this runs, the app sends nothing new: SEND N PASSES and the reminder
-- stay off.
-- =============================================================================

alter table public.events
  add column if not exists reminder_enabled boolean not null default true;

alter table public.events
  add column if not exists reminder_sent_at timestamptz;

alter table public.event_guests
  add column if not exists bounced_at timestamptz;

alter table public.event_guests
  add column if not exists last_mail_error text;

create table if not exists public.event_mail_log (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events (id) on delete cascade,
  guest_id    uuid references public.event_guests (id) on delete cascade,
  kind        text not null check (kind in ('invite', 'reminder', 'deletion')),
  sent_at     timestamptz not null default now(),
  provider_id text
);

create unique index if not exists event_mail_log_once
  on public.event_mail_log (guest_id, kind) where guest_id is not null and kind in ('invite', 'reminder');

create index if not exists event_mail_log_provider
  on public.event_mail_log (provider_id) where provider_id is not null;

create index if not exists event_mail_log_event
  on public.event_mail_log (event_id, kind);

alter table public.event_mail_log enable row level security;
