-- The access mail after I'm going: one per registration, claimed in the mail log as `access`.
-- Until this runs, the claim fails and no access mail is sent; I'm going opens the pass as before.

alter table public.event_mail_log drop constraint if exists event_mail_log_kind_check;
alter table public.event_mail_log
  add constraint event_mail_log_kind_check check (kind in ('invite', 'reminder', 'deletion', 'access'));
