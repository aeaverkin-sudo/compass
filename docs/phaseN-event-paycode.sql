-- event_registrations: код оплаты
alter table public.event_registrations add column if not exists pay_code text;
create unique index if not exists event_registrations_pay_code_uniq
  on public.event_registrations (event_id, pay_code) where pay_code is not null;

-- events: способ оплаты текстом (альтернатива ссылке)
alter table public.events add column if not exists payment_note text;

-- paid_source: добавить 'name' к текущим ('return','statement','manual')
alter table public.event_registrations drop constraint if exists event_registrations_paid_source_check;
alter table public.event_registrations
  add constraint event_registrations_paid_source_check
  check (paid_source is null or paid_source in ('return','statement','manual','name'));
