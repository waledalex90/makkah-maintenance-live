-- عمود اسم المستخدم الظاهر + توسيع can_access_ticket لمجموعات المنطقة/التخصص حتى الإغلاق

alter table public.profiles
  add column if not exists username text;

create unique index if not exists idx_profiles_username_unique_ci
  on public.profiles (lower(username))
  where username is not null and length(trim(username)) > 0;

comment on column public.profiles.username is 'اسم الدخول الظاهر (بدون النطاق الاصطناعي)';

-- وصول مشترك: فني / مشرف / مهندس في نفس المنطقة والتخصص يرى البلاغ حتى يصبح finished
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
  ),
  prof as (
    select * from public.profiles where id = (select uid from me)
  )
  select
    case
      when (select role from me)::text in ('admin', 'project_manager', 'projects_director') then true

      when (select role from me)::text = 'engineer' then
        exists (
          select 1
          from t
          join public.engineer_zones ez on ez.zone_id = t.zone_id and ez.engineer_id = (select uid from me)
          where
            (select specialty from prof) is null
            or public.category_id_matches_profile_specialty(t.category_id, (select specialty from prof))
        )

      when (select role from me)::text = 'supervisor' then
        exists (
          select 1
          from t
          left join public.profiles tech on tech.id = t.assigned_technician_id
          where t.id = p_ticket_id
            and (
              t.assigned_supervisor_id = (select uid from me)
              or tech.supervisor_id = (select uid from me)
            )
        )
        or exists (
          select 1
          from t
          join public.profiles p on p.id = (select uid from me)
          join public.zone_profiles zp on zp.profile_id = p.id and zp.zone_id = t.zone_id
          where t.id = p_ticket_id
            and t.status::text <> 'finished'
            and (
              p.specialty is null
              or public.category_id_matches_profile_specialty(t.category_id, p.specialty)
            )
            and (
              p.region is null
              or not exists (select 1 from public.zones z where z.id = t.zone_id)
              or p.region = (select z.name from public.zones z where z.id = t.zone_id limit 1)
            )
        )

      when (select role from me)::text = 'technician' then
        exists (
          select 1
          from t
          where t.id = p_ticket_id
            and t.status::text = 'finished'
            and t.assigned_technician_id = (select uid from me)
        )
        or exists (
          select 1
          from t
          join public.profiles p on p.id = (select uid from me)
          join public.zone_profiles zp on zp.profile_id = p.id and zp.zone_id = t.zone_id
          where t.id = p_ticket_id
            and t.status::text <> 'finished'
            and (
              p.specialty is null
              or public.category_id_matches_profile_specialty(t.category_id, p.specialty)
            )
            and (
              p.region is null
              or not exists (select 1 from public.zones z where z.id = t.zone_id)
              or p.region = (select z.name from public.zones z where z.id = t.zone_id limit 1)
            )
        )

      when (select role from me)::text = 'reporter' then
        exists (
          select 1
          from t
          where t.id = p_ticket_id and t.created_by = (select uid from me)
        )

      else false
    end;
$$;
