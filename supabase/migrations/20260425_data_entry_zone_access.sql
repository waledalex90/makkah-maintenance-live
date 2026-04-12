-- دور إدخال بيانات العمليات: رؤية كل البلاغات في المناطق المربوطة بملفه (بدون تخصص/منطقة نصية/تعيين)
alter type public.app_role add value if not exists 'data_entry';

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

      when (select role from me)::text = 'data_entry' then
        exists (
          select 1
          from t
          join public.profiles p on p.id = (select uid from me)
          join public.zone_profiles zp on zp.profile_id = p.id and zp.zone_id = t.zone_id
          where t.id = p_ticket_id
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
