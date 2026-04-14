-- =========================================================
-- Migration: Targeted assignment notifications
-- =========================================================

create or replace function public.notify_ticket_assignment_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.zone_id is null then
    return new;
  end if;

  if new.assigned_supervisor_id is distinct from old.assigned_supervisor_id and new.assigned_supervisor_id is not null then
    insert into public.zone_notifications (recipient_id, ticket_id, zone_id, title, body)
    values (
      new.assigned_supervisor_id,
      new.id,
      new.zone_id,
      'تكليف مراقب',
      'تم تكليفك للإشراف على البلاغ رقم ' || coalesce(new.external_ticket_number, new.ticket_number::text, left(new.id::text, 8))
    );
  end if;

  if new.assigned_technician_id is distinct from old.assigned_technician_id and new.assigned_technician_id is not null then
    insert into public.zone_notifications (recipient_id, ticket_id, zone_id, title, body)
    values (
      new.assigned_technician_id,
      new.id,
      new.zone_id,
      'تكليف فني',
      'تم تكليفك بتنفيذ البلاغ رقم ' || coalesce(new.external_ticket_number, new.ticket_number::text, left(new.id::text, 8))
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_tickets_assignment_notifications on public.tickets;
create trigger trg_tickets_assignment_notifications
after update on public.tickets
for each row execute function public.notify_ticket_assignment_changes();
