-- وقت أول انتقال إلى «تم الاستلام» — لحساب تأخير التنفيذ منذ الاستلام

alter table public.tickets add column if not exists received_at timestamptz null;

comment on column public.tickets.received_at is 'يُضبط عند أول انتقال للحالة received؛ يُصفّر عند الخروج منها';

create or replace function public.trg_tickets_set_received_at()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'received'::public.ticket_status then
    if tg_op = 'INSERT' then
      new.received_at := now();
    elsif old.status is distinct from 'received'::public.ticket_status then
      new.received_at := now();
    else
      new.received_at := old.received_at;
    end if;
  else
    new.received_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_tickets_received_at on public.tickets;
create trigger trg_tickets_received_at
before insert or update of status on public.tickets
for each row execute function public.trg_tickets_set_received_at();

update public.tickets t
set received_at = coalesce(t.received_at, t.updated_at, t.created_at)
where t.status = 'received'::public.ticket_status;
