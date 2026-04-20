-- 1) مدير المنصة لا يُسجَّل كعضو في أي شركة (company_memberships).
-- 2) توسيع subscription_plans بـ JSONB للميزات والحدود الإضافية.
-- 3) تعديل تطهير المنصة وحدود الفنيين بعدم احتساب مدير المنصة.

-- --- عضويات سابقة لمديري المنصة ---
delete from public.company_memberships cm
using public.platform_admins pa
where cm.user_id = pa.user_id and pa.is_active = true;

-- ربط ملفات مديري المنصة بشركة الصدفة دون active_company (سياق المنصة فقط)
update public.profiles p
set
  company_id = coalesce(
    (select c.id from public.companies c where c.slug = '__platform-shell__' limit 1),
    p.company_id
  ),
  active_company_id = null
where exists (
  select 1 from public.platform_admins pa where pa.user_id = p.id and pa.is_active = true
);

-- --- منع إدراج/تعديل عضوية لمدير المنصة ---
create or replace function public.prevent_platform_admin_company_membership()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1 from public.platform_admins pa
    where pa.user_id = new.user_id and pa.is_active = true
  ) then
    raise exception 'platform_admin_cannot_be_company_member';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_platform_admin_membership on public.company_memberships;
create trigger trg_prevent_platform_admin_membership
before insert or update of user_id, company_id on public.company_memberships
for each row execute function public.prevent_platform_admin_company_membership();

-- --- subscription_plans: ميزات وحدود مرنة ---
alter table public.subscription_plans
  add column if not exists features jsonb not null default '{}'::jsonb;

alter table public.subscription_plans
  add column if not exists limits jsonb not null default '{}'::jsonb;

comment on column public.subscription_plans.features is 'Feature flags per plan (boolean keys, extensible without schema change).';
comment on column public.subscription_plans.limits is 'Additional numeric limits (e.g. max_users); core columns remain for backward compatibility.';

-- إزالة باقات العرض إن لم تُستخدم من أي شركة (نظّف الجدول قدر الإمكان)
delete from public.subscription_plans sp
where sp.plan_key in ('basic', 'pro')
  and not exists (select 1 from public.companies c where c.subscription_plan = sp.plan_key);

-- --- تحديث حدود الفنيين: لا يُحسب مدير المنصة ---
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

  if coalesce(new.role, '') not in ('technician', 'engineer', 'supervisor') then
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
    and p.role in ('technician', 'engineer', 'supervisor')
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

-- --- تطهير المنصة: لا عضوية لمدير المنصة؛ فصل active_company للمنصة ---
create or replace function public.platform_purge_tenant_data(p_actor uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shell uuid := 'a0000000-0000-4000-8000-000000000001'::uuid;
begin
  if p_actor is null then
    raise exception 'missing_actor';
  end if;

  if not exists (select 1 from public.platform_admins where user_id = p_actor and is_active = true) then
    raise exception 'not_platform_admin';
  end if;

  if not exists (select 1 from public.profiles where id = p_actor) then
    raise exception 'actor_profile_missing';
  end if;

  insert into public.companies (
    id,
    name,
    slug,
    subscription_plan,
    status,
    subscription_status
  )
  values (
    v_shell,
    'UP FLOW — منصة',
    '__platform-shell__',
    'enterprise',
    'active',
    'active'
  )
  on conflict (slug) do update
    set name = excluded.name,
        subscription_plan = excluded.subscription_plan,
        status = excluded.status,
        subscription_status = excluded.subscription_status;

  update public.profiles p
  set
    company_id = v_shell,
    active_company_id = case
      when exists (select 1 from public.platform_admins pa where pa.user_id = p.id and pa.is_active = true)
      then null
      else v_shell
    end;

  delete from public.ticket_chats;
  delete from public.ticket_attachments;
  delete from public.reporter_ticket_followups;
  delete from public.tickets;
  delete from public.live_locations;
  delete from public.zone_profiles;
  delete from public.engineer_zones;
  delete from public.zones;
  delete from public.company_invoices;
  delete from public.company_notifications;
  delete from public.company_settings;
  delete from public.roles where company_id is not null;
  delete from public.company_memberships;

  delete from public.companies where id <> v_shell;

  insert into public.company_memberships (user_id, company_id, role_id, status, is_owner)
  select id, v_shell, null, 'active', false
  from public.profiles
  where not exists (
    select 1 from public.platform_admins pa where pa.user_id = profiles.id and pa.is_active = true
  )
  on conflict (user_id, company_id) do update
    set status = 'active',
        is_owner = excluded.is_owner;

  return jsonb_build_object(
    'ok', true,
    'shell_company_id', v_shell
  );
end;
$$;

comment on function public.platform_purge_tenant_data(uuid) is
  'حذف جميع الشركات والبيانات التشغيلية؛ يُبقي شركة صدفية. لا يُنشئ عضوية لمدير المنصة.';
