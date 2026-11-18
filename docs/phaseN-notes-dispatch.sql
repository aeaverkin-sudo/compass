-- ============================================================
-- Compass — one-time notes: a sent batch is its own row.
-- Supabase → SQL Editor → New query.
-- Paste the CONTENTS of this file (Cmd+A, Cmd+C), not the file name.
-- Safe to run again.
--
-- The app does not apply this file. Until it runs, Share works as now:
-- one waiting batch, no code in the link.
--
-- A batch still waiting on the card stays `pending`. The old unique
-- index card_transfers_one_pending is not dropped and not replaced.
-- Share, once the files are stored, sets that row to `sent`. The
-- code in the link is the row's existing transfer_token.
-- Opening the link burns a `sent` row only, and only for the card
-- that owns the page. A row still `pending` is left alone, so a
-- selfie that has not finished uploading cannot burn.
-- The old consume_pending_transfer stays. Links sent before this
-- file still burn through it.
-- ============================================================

begin;

-- The only check on card_transfers is the status list, created inline
-- in phase1 as: check (status in ('pending','consumed','expired')).
-- Postgres names that constraint card_transfers_status_check.
-- Drop that one constraint, whether it is still the old list or this
-- file's wider list. Do not drop any other check.
do $$
declare
  name text;
begin
  select con.conname into name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'card_transfers'
    and con.contype = 'c'
    and (
      con.conname = 'card_transfers_status_check'
      or pg_get_constraintdef(con.oid) ~* 'status[[:space:]]+in[[:space:]]*\('
    )
  order by case when con.conname = 'card_transfers_status_check' then 0 else 1 end
  limit 1;

  if name is not null then
    execute format('alter table public.card_transfers drop constraint %I', name);
  end if;
end $$;

alter table public.card_transfers
  add constraint card_transfers_status_check
  check (status in ('pending', 'sent', 'consumed', 'expired'));

-- The one-argument draft of this function is not in production.
-- Drop it so a second run cannot leave two overloads.
drop function if exists public.consume_sent_transfer(text);

-- One row wins. A second open skips the locked row and returns null.
-- A batch that is still pending is not a candidate.
create or replace function public.consume_sent_transfer(p_token text, p_card_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  won uuid;
begin
  with candidate as (
    select id
    from public.card_transfers
    where transfer_token = p_token
      and card_id = p_card_id
      and status = 'sent'
      and expires_at > now()
    limit 1
    for update skip locked
  )
  update public.card_transfers as transfer
  set status = 'consumed',
      consumed_at = now()
  from candidate
  where transfer.id = candidate.id
  returning transfer.id into won;

  return won;
end;
$$;

revoke all on function public.consume_sent_transfer(text, uuid) from public;
revoke all on function public.consume_sent_transfer(text, uuid) from anon;
revoke all on function public.consume_sent_transfer(text, uuid) from authenticated;
grant execute on function public.consume_sent_transfer(text, uuid) to service_role;

commit;
