-- إصلاح: coalesce(new.role, '') يفشل مع عمود app_role لأن '' ليست قيمة تعداد.
-- (يُطبَّق على القواعد التي نفّذت الهجرة السابقة قبل التصحيح.)

create or replace function public.enforce_company_limits_profiles()
returns trigger
language plpgsql
as $$
declare
  v_limit int;
  v_count int;
  v_target_company uuid;
begin
  v_target_company := new.company_id;
  if v_target_company is null then
    return new;
  end if;

  if new.role is null or new.role::text not in ('technician', 'engineer', 'supervisor') then
    return new;
  end if;

  v_limit := public.company_plan_limit(v_target_company, 'technicians');
  if v_limit is null then
    return new;
  end if;

  select count(*)::int
  into v_count
  from public.profiles p
  where p.company_id = v_target_company
    and p.role::text in ('technician', 'engineer', 'supervisor')
    and p.id <> new.id
    and not exists (
      select 1 from public.platform_admins pa where pa.user_id = p.id and pa.is_active = true
    );

  if (v_count + 1) > v_limit then
    raise exception 'Technician limit exceeded for company % (limit=%).', v_target_company, v_limit;
  end if;

  return new;
end;
$$;
