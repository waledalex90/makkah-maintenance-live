-- Phase 2: RLS Starter Pack (tenant-aware + platform admin bypass)

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.platform_admins pa
    where pa.user_id = auth.uid()
      and pa.is_active = true
  )
$$;

create or replace function public.is_active_company_member(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.company_memberships cm
    where cm.user_id = auth.uid()
      and cm.company_id = p_company_id
      and cm.status = 'active'
  )
$$;

create or replace function public.can_access_company(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_platform_admin()
    or (
      p_company_id is not null
      and p_company_id = public.current_company_id()
      and public.is_active_company_member(p_company_id)
    )
$$;

alter table public.profiles enable row level security;
alter table public.tickets enable row level security;
alter table public.zones enable row level security;
alter table public.ticket_attachments enable row level security;

alter table public.profiles force row level security;
alter table public.tickets force row level security;
alter table public.zones force row level security;
alter table public.ticket_attachments force row level security;

-- Clean up any old/global policies on starter tables.
do $$
declare
  p record;
begin
  for p in
    select pol.policyname, pol.tablename
    from pg_policies pol
    where pol.schemaname = 'public'
      and pol.tablename in ('profiles', 'tickets', 'zones', 'ticket_attachments')
  loop
    execute format('drop policy if exists %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

-- profiles policies
create policy profiles_tenant_select
on public.profiles
for select
to authenticated
using (public.can_access_company(company_id));

create policy profiles_tenant_insert
on public.profiles
for insert
to authenticated
with check (public.can_access_company(company_id));

create policy profiles_tenant_update
on public.profiles
for update
to authenticated
using (public.can_access_company(company_id))
with check (public.can_access_company(company_id));

create policy profiles_tenant_delete
on public.profiles
for delete
to authenticated
using (public.can_access_company(company_id));

-- tickets policies
create policy tickets_tenant_select
on public.tickets
for select
to authenticated
using (public.can_access_company(company_id));

create policy tickets_tenant_insert
on public.tickets
for insert
to authenticated
with check (public.can_access_company(company_id));

create policy tickets_tenant_update
on public.tickets
for update
to authenticated
using (public.can_access_company(company_id))
with check (public.can_access_company(company_id));

create policy tickets_tenant_delete
on public.tickets
for delete
to authenticated
using (public.can_access_company(company_id));

-- zones policies
create policy zones_tenant_select
on public.zones
for select
to authenticated
using (public.can_access_company(company_id));

create policy zones_tenant_insert
on public.zones
for insert
to authenticated
with check (public.can_access_company(company_id));

create policy zones_tenant_update
on public.zones
for update
to authenticated
using (public.can_access_company(company_id))
with check (public.can_access_company(company_id));

create policy zones_tenant_delete
on public.zones
for delete
to authenticated
using (public.can_access_company(company_id));

-- ticket_attachments policies
create policy ticket_attachments_tenant_select
on public.ticket_attachments
for select
to authenticated
using (public.can_access_company(company_id));

create policy ticket_attachments_tenant_insert
on public.ticket_attachments
for insert
to authenticated
with check (public.can_access_company(company_id));

create policy ticket_attachments_tenant_update
on public.ticket_attachments
for update
to authenticated
using (public.can_access_company(company_id))
with check (public.can_access_company(company_id));

create policy ticket_attachments_tenant_delete
on public.ticket_attachments
for delete
to authenticated
using (public.can_access_company(company_id));

