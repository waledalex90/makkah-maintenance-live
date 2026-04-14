-- إغلاق البلاغ: من أغلق يبقى الوحيد (غير الإدارة) الذي يرى البلاغ بعد finished
-- بحث سريع: عمود نصي مولَّد من ticket_number لتفادي cast داخل PostgREST .or()

alter table public.tickets
  add column if not exists closed_by uuid null references public.profiles(id) on delete set null;

comment on column public.tickets.closed_by is 'المستخدم الذي حوّل البلاغ إلى finished (يُملأ تلقائياً عند الانتقال للحالة)';

create index if not exists idx_tickets_closed_by on public.tickets (closed_by)
  where closed_by is not null;

-- عمود للفلترة النصية على رقم البلاغ الداخلي (PostgREST لا يقبل cast داخل شجرة or)
alter table public.tickets
  add column if not exists ticket_number_text text
  generated always as (coalesce(ticket_number::text, '')) stored;

comment on column public.tickets.ticket_number_text is 'نسخة نصية من ticket_number للبحث بـ ilike';

create or replace function public.set_ticket_closed_by_on_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'insert' then
    if new.status = 'finished'::public.ticket_status and new.closed_by is null then
      new.closed_by := auth.uid();
    end if;
  elsif tg_op = 'update' then
    if new.status = 'finished'::public.ticket_status and (old.status is distinct from 'finished'::public.ticket_status) then
      if new.closed_by is null then
        new.closed_by := auth.uid();
      end if;
    elsif old.status = 'finished'::public.ticket_status and new.status is distinct from 'finished'::public.ticket_status then
      new.closed_by := null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_tickets_set_closed_by on public.tickets;
create trigger trg_tickets_set_closed_by
before insert or update on public.tickets
for each row execute function public.set_ticket_closed_by_on_status();

-- تعيين تقريبي للبلاغات المُغلقة سابقاً (حتى يظل الفني يرى ما أنجزه إن وُجد تعيين)
update public.tickets t
set closed_by = t.assigned_technician_id
where t.status = 'finished'::public.ticket_status
  and t.closed_by is null
  and t.assigned_technician_id is not null;

-- وصول موحّد: منطقة + تخصص؛ بعد finished يظهر البلاغ لمن أغلقه فقط (ومن له أدوار إدارية عليا)
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

      when (select role from me)::text = 'reporter' then
        exists (
          select 1
          from t
          where created_by = (select uid from me)
        )

      when (select role from me)::text = 'engineer' then
        exists (
          select 1
          from t
          join public.engineer_zones ez on ez.zone_id = t.zone_id and ez.engineer_id = (select uid from me)
          join public.profiles p on p.id = (select uid from me)
          where t.id = p_ticket_id
            and (
              p.specialty is null
              or public.category_id_matches_profile_specialty(t.category_id, p.specialty)
            )
            and (
              t.status::text <> 'finished'
              or t.closed_by = (select uid from me)
            )
        )

      when (select role from me)::text = 'supervisor' then
        exists (
          select 1
          from t
          join public.profiles p on p.id = (select uid from me)
          join public.zone_profiles zp on zp.profile_id = p.id and zp.zone_id = t.zone_id
          where t.id = p_ticket_id
            and (
              p.specialty is null
              or public.category_id_matches_profile_specialty(t.category_id, p.specialty)
            )
            and (
              p.region is null
              or not exists (select 1 from public.zones z where z.id = t.zone_id)
              or p.region = (select z.name from public.zones z where z.id = t.zone_id limit 1)
            )
            and (
              t.status::text <> 'finished'
              or t.closed_by = (select uid from me)
            )
        )

      when (select role from me)::text = 'technician' then
        exists (
          select 1
          from t
          join public.profiles p on p.id = (select uid from me)
          join public.zone_profiles zp on zp.profile_id = p.id and zp.zone_id = t.zone_id
          where t.id = p_ticket_id
            and (
              p.specialty is null
              or public.category_id_matches_profile_specialty(t.category_id, p.specialty)
            )
            and (
              p.region is null
              or not exists (select 1 from public.zones z where z.id = t.zone_id)
              or p.region = (select z.name from public.zones z where z.id = t.zone_id limit 1)
            )
            and (
              t.status::text <> 'finished'
              or t.closed_by = (select uid from me)
            )
        )

      else false
    end;
$$;
