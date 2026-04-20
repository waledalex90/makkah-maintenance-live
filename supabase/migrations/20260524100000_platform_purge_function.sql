-- تطهير المنصة: حذف كل بيانات المستأجرين مع الإبقاء على حساب مدير المنصة الحالي.
-- شركة صدفية ثابتة (slug) تُعاد استخدامها بعد كل تطهير.

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

  -- ربط كل الملفات بشركة الصدفة قبل حذف الشركات الأخرى (تفادي انتهاك FK)
  update public.profiles
  set
    company_id = v_shell,
    active_company_id = v_shell;

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
  select id, v_shell, null, 'active', (id = p_actor)
  from public.profiles
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
  'حذف جميع الشركات والبيانات التشغيلية؛ يُبقي شركة صدفية ومدير المنصة الحالي فقط. يُستدعى من الخادم بمفتاح الخدمة.';

grant execute on function public.platform_purge_tenant_data(uuid) to service_role;
