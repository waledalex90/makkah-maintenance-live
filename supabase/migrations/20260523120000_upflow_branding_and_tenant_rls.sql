-- UP FLOW: ألوان براند قابلة للتخصيص + تعزيز عزل المستأجر (RLS على companies و company_memberships)

-- 1) ألوان الشركة (قيم افتراضية تُعرَض من التطبيق إذا كانت NULL)
alter table public.companies
  add column if not exists branding_primary_hex text null,
  add column if not exists branding_accent_hex text null;

comment on column public.companies.branding_primary_hex is 'لون أساسي (مثال #1e3a5f) — UP FLOW default من الواجهة';
comment on column public.companies.branding_accent_hex is 'لون تنبيه/عمليات (مثال #ea580c)';

-- 2) تحديث أسماء عرض الباقات (Basic / Pro / Enterprise)
update public.subscription_plans
set display_name = case plan_key
  when 'basic' then 'UP FLOW · Basic'
  when 'pro' then 'UP FLOW · Pro'
  when 'enterprise' then 'UP FLOW · Enterprise'
  else display_name
end
where plan_key in ('basic', 'pro', 'enterprise');

-- 3) RLS: companies — قراءة فقط للعضو النشط أو مدير المنصة
alter table public.companies enable row level security;
alter table public.companies force row level security;

drop policy if exists companies_tenant_select on public.companies;
create policy companies_tenant_select
on public.companies
for select
to authenticated
using (
  public.is_platform_admin()
  or exists (
    select 1
    from public.company_memberships cm
    where cm.company_id = companies.id
      and cm.user_id = auth.uid()
      and cm.status = 'active'
  )
);

-- 4) RLS: company_memberships — عضويتي أو مدير المنصة (لا يُفتح إدراج/تعديل من العميل عبر RLS هنا؛ الإدعاءات عبر API بخدمة)
alter table public.company_memberships enable row level security;
alter table public.company_memberships force row level security;

drop policy if exists company_memberships_select_own on public.company_memberships;
create policy company_memberships_select_own
on public.company_memberships
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists company_memberships_select_platform on public.company_memberships;
create policy company_memberships_select_platform
on public.company_memberships
for select
to authenticated
using (public.is_platform_admin());
