-- ============================================================
-- Compass — event address from the name
-- Supabase → SQL Editor → New query.
-- Paste the CONTENTS of this file (Cmd+A, Cmd+C), not the file name.
-- Run once. Safe to run again.
--
-- The guest link is /e/<name>. A second event with the same name
-- is /e/<name>-2. The short code and the public token still open.
-- The app does not apply this file.
-- ============================================================

alter table public.events add column if not exists slug text;

create unique index if not exists events_slug_key
  on public.events (slug)
  where slug is not null;

-- Same rules as src/shared/event/slug.ts. Letters, digits, hyphens.
create or replace function public.event_name_slug(raw text)
returns text
language plpgsql
immutable
as $$
declare
  s text := lower(btrim(coalesce(raw, '')));
  i int;
  ch text;
  cp int;
  out text := '';
  prev_hyphen boolean := false;
begin
  for i in 1..char_length(s) loop
    ch := substr(s, i, 1);
    if ch ~ '\s' or ch = '_' or ch = '-' then
      if out <> '' and not prev_hyphen and char_length(out) < 60 then
        out := out || '-';
        prev_hyphen := true;
      end if;
      continue;
    end if;
    cp := ascii(ch);
    if char_length(out) >= 60 or not (
      (cp between 48 and 57)
      or (cp between 97 and 122)
      or (cp between 192 and 687)
      or (cp between 1024 and 1327)
    ) then
      continue;
    end if;
    out := out || ch;
    prev_hyphen := false;
  end loop;
  while right(out, 1) = '-' loop
    out := left(out, char_length(out) - 1);
  end loop;
  if out = '' then
    return null;
  end if;
  return out;
end;
$$;

do $$
declare
  r record;
  stem text;
  candidate text;
  n int;
begin
  for r in
    select id, name
    from public.events
    where slug is null
    order by created_at, id
  loop
    stem := public.event_name_slug(r.name);
    if stem is null then
      continue;
    end if;
    candidate := stem;
    n := 2;
    while exists (select 1 from public.events where slug = candidate) loop
      candidate := rtrim(left(stem, 64 - char_length(n::text) - 1), '-') || '-' || n::text;
      n := n + 1;
      if n > 500 then
        candidate := null;
        exit;
      end if;
    end loop;
    if candidate is not null then
      update public.events set slug = candidate where id = r.id;
    end if;
  end loop;
end $$;

drop function if exists public.event_invite(text);

create function public.event_invite(lookup text)
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
  code text,
  slug text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if lookup is null
     or char_length(lookup) < 1
     or char_length(lookup) > 80
     or lookup ~ '[[:space:]/%\\?#]'
  then
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
    e.code,
    e.slug
  from public.events as e
  where e.public_token = lookup
     or e.code = lookup
     or e.slug = lower(lookup)
  order by
    case
      when e.public_token = lookup then 0
      when e.code = lookup then 1
      else 2
    end
  limit 1;
end;
$$;

revoke all on function public.event_invite(text) from public;
grant execute on function public.event_invite(text) to anon, authenticated, service_role;

revoke all on function public.event_name_slug(text) from public;
