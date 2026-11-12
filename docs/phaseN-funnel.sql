-- ============================================================
-- Compass — where a new visitor stops. No names, no mail.
-- Supabase → SQL Editor → New query.
-- Paste the CONTENTS of this file (Cmd+A, Cmd+C), not the file name.
-- Safe to run again.
--
-- The app does not apply this file. Until it runs, /api/f answers
-- 204 and writes nothing. The questionnaire does not change.
-- ============================================================

create table if not exists public.funnel_events (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  session text not null,
  step text not null,
  detail text,
  client text,
  source text
);

create index if not exists funnel_events_at_idx on public.funnel_events (at);

alter table public.funnel_events enable row level security;

revoke all on table public.funnel_events from public, anon, authenticated;
grant insert on table public.funnel_events to service_role;

-- Воронка за 7 дней: сколько вкладок дошло до каждого шага
-- select step, count(distinct session) as tabs
-- from public.funnel_events
-- where at > now() - interval '7 days'
-- group by step
-- order by min(id);

-- Красные поля: в каких зонах чаще всего
-- select detail, count(*) from public.funnel_events
-- where step = 'create_red' and at > now() - interval '7 days'
-- group by detail order by 2 desc;

-- Откуда приходят и сколько из них регистрируется
-- select source,
--   count(distinct session) as tabs,
--   count(distinct session) filter (where step = 'signup_ok') as registered
-- from public.funnel_events
-- where at > now() - interval '7 days'
-- group by source order by tabs desc;

-- По типу браузера: где бросают анкету
-- select client,
--   count(distinct session) filter (where step = 'create_view') as opened,
--   count(distinct session) filter (where step = 'signup_ok') as registered
-- from public.funnel_events
-- where at > now() - interval '7 days'
-- group by client;
