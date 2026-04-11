-- =========================================================
-- حالات بلاغ ثلاثية + عمود رقم هاتف مقدم البلاغ
-- not_received = لم يستلم، received = تم الاستلام، finished = تم الانتهاء
-- =========================================================

alter table public.tickets
  add column if not exists reporter_phone text;

-- استبدال enum الحالات
alter type public.ticket_status rename to ticket_status_legacy;

create type public.ticket_status as enum ('not_received', 'received', 'finished');

alter table public.tickets alter column status drop default;

alter table public.tickets
  alter column status type public.ticket_status
  using (
    case status::text
      when 'new' then 'not_received'::public.ticket_status
      when 'assigned' then 'received'::public.ticket_status
      when 'on_the_way' then 'received'::public.ticket_status
      when 'arrived' then 'received'::public.ticket_status
      when 'fixed' then 'finished'::public.ticket_status
      else 'not_received'::public.ticket_status
    end
  );

alter table public.tickets
  alter column status set default 'not_received'::public.ticket_status;

drop type public.ticket_status_legacy;

-- سياسة التحديث: المراسل يغيّر فقط إلى finished
drop policy if exists "tickets_update_policy" on public.tickets;
create policy "tickets_update_policy"
on public.tickets
for update
to authenticated
using (public.can_access_ticket(id))
with check (
  public.can_access_ticket(id)
  and (
    public.current_user_role()::text not in ('reporter')
    or (
      public.current_user_role()::text = 'reporter'
      and created_by = auth.uid()
      and status = 'finished'::public.ticket_status
    )
  )
);

-- تفعيل closed_at عند الانتهاء
create or replace function public.set_ticket_closed_at()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'finished'::public.ticket_status and old.status is distinct from 'finished'::public.ticket_status then
    new.closed_at = coalesce(new.closed_at, now());
  elsif old.status = 'finished'::public.ticket_status and new.status is distinct from 'finished'::public.ticket_status then
    new.closed_at = null;
  end if;
  return new;
end;
$$;

-- تحديث can_access_ticket: البلاغات المفتوحة بالحالات الجديدة
create or replace function public.can_access_ticket(p_ticket_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select auth.uid() as uid, public.current_user_role() as role
  ),
  t as (
    select *
    from public.tickets
    where id = p_ticket_id
  )
  select
    case
      when (select role from me)::text in ('admin', 'project_manager', 'projects_director') then true
      when (select role from me)::text = 'engineer' then
        exists (
          select 1
          from t
          join public.engineer_zones ez on ez.zone_id = t.zone_id
          where ez.engineer_id = (select uid from me)
        )
      when (select role from me)::text = 'supervisor' then
        exists (
          select 1
          from t
          left join public.profiles tech on tech.id = t.assigned_technician_id
          where
            t.assigned_supervisor_id = (select uid from me)
            or tech.supervisor_id = (select uid from me)
        )
        or exists (
          select 1
          from t
          join public.profiles prof on prof.id = (select uid from me)
          join public.zone_profiles zp on zp.profile_id = prof.id and zp.zone_id = t.zone_id
          where t.status::text in ('not_received', 'received')
            and (
              prof.specialty is null
              or public.category_id_matches_profile_specialty(t.category_id, prof.specialty)
            )
            and (
              prof.region is null
              or not exists (select 1 from public.zones z where z.id = t.zone_id)
              or prof.region = (select z.name from public.zones z where z.id = t.zone_id limit 1)
            )
        )
      when (select role from me)::text = 'technician' then
        exists (
          select 1
          from t
          where t.assigned_technician_id = (select uid from me)
        )
        or exists (
          select 1
          from t
          join public.profiles prof on prof.id = (select uid from me)
          join public.zone_profiles zp on zp.profile_id = prof.id and zp.zone_id = t.zone_id
          where t.status::text in ('not_received', 'received')
            and public.category_id_matches_profile_specialty(t.category_id, prof.specialty)
            and (
              prof.region is null
              or not exists (select 1 from public.zones z where z.id = t.zone_id)
              or prof.region = (select z.name from public.zones z where z.id = t.zone_id limit 1)
            )
        )
      when (select role from me)::text = 'reporter' then
        exists (
          select 1
          from t
          where t.created_by = (select uid from me)
        )
      else false
    end;
$$;
