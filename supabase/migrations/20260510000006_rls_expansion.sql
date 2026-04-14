-- Phase 2.5: Expand tenant-aware RLS to remaining operational tables
-- Tables: ticket_chats, live_locations, zone_profiles, engineer_zones, reporter_ticket_followups

-- 1) Ensure company_id exists (defensive), then backfill safely.
alter table public.ticket_chats
  add column if not exists company_id uuid null references public.companies(id) on delete restrict;
alter table public.live_locations
  add column if not exists company_id uuid null references public.companies(id) on delete restrict;
alter table public.zone_profiles
  add column if not exists company_id uuid null references public.companies(id) on delete restrict;
alter table public.engineer_zones
  add column if not exists company_id uuid null references public.companies(id) on delete restrict;
alter table public.reporter_ticket_followups
  add column if not exists company_id uuid null references public.companies(id) on delete restrict;

update public.ticket_chats tc
set company_id = t.company_id
from public.tickets t
where tc.ticket_id = t.id
  and tc.company_id is null;

update public.live_locations ll
set company_id = p.company_id
from public.profiles p
where ll.user_id = p.id
  and ll.company_id is null;

update public.zone_profiles zp
set company_id = p.company_id
from public.profiles p
where zp.profile_id = p.id
  and zp.company_id is null;

update public.zone_profiles zp
set company_id = z.company_id
from public.zones z
where zp.zone_id = z.id
  and zp.company_id is null;

update public.engineer_zones ez
set company_id = p.company_id
from public.profiles p
where ez.engineer_id = p.id
  and ez.company_id is null;

update public.engineer_zones ez
set company_id = z.company_id
from public.zones z
where ez.zone_id = z.id
  and ez.company_id is null;

update public.reporter_ticket_followups rf
set company_id = t.company_id
from public.tickets t
where rf.ticket_id = t.id
  and rf.company_id is null;

-- 2) Indexes (use IF NOT EXISTS for migration safety).
create index if not exists idx_ticket_chats_company_id on public.ticket_chats(company_id);
create index if not exists idx_live_locations_company_id on public.live_locations(company_id);
create index if not exists idx_zone_profiles_company_id on public.zone_profiles(company_id);
create index if not exists idx_engineer_zones_company_id on public.engineer_zones(company_id);
create index if not exists idx_reporter_followups_company_id on public.reporter_ticket_followups(company_id);

-- 3) Enforce non-null once backfill is done.
do $$
begin
  if exists (select 1 from public.ticket_chats where company_id is null) then
    raise exception 'ticket_chats.company_id still has null values';
  end if;
  if exists (select 1 from public.live_locations where company_id is null) then
    raise exception 'live_locations.company_id still has null values';
  end if;
  if exists (select 1 from public.zone_profiles where company_id is null) then
    raise exception 'zone_profiles.company_id still has null values';
  end if;
  if exists (select 1 from public.engineer_zones where company_id is null) then
    raise exception 'engineer_zones.company_id still has null values';
  end if;
  if exists (select 1 from public.reporter_ticket_followups where company_id is null) then
    raise exception 'reporter_ticket_followups.company_id still has null values';
  end if;
end $$;

alter table public.ticket_chats alter column company_id set not null;
alter table public.live_locations alter column company_id set not null;
alter table public.zone_profiles alter column company_id set not null;
alter table public.engineer_zones alter column company_id set not null;
alter table public.reporter_ticket_followups alter column company_id set not null;

-- 4) Enable and force RLS.
alter table public.ticket_chats enable row level security;
alter table public.live_locations enable row level security;
alter table public.zone_profiles enable row level security;
alter table public.engineer_zones enable row level security;
alter table public.reporter_ticket_followups enable row level security;

alter table public.ticket_chats force row level security;
alter table public.live_locations force row level security;
alter table public.zone_profiles force row level security;
alter table public.engineer_zones force row level security;
alter table public.reporter_ticket_followups force row level security;

-- 5) Remove old/global policies on these tables.
do $$
declare
  p record;
begin
  for p in
    select pol.policyname, pol.tablename
    from pg_policies pol
    where pol.schemaname = 'public'
      and pol.tablename in (
        'ticket_chats',
        'live_locations',
        'zone_profiles',
        'engineer_zones',
        'reporter_ticket_followups'
      )
  loop
    execute format('drop policy if exists %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

-- 6) Tenant-aware CRUD policies using can_access_company(company_id).
create policy ticket_chats_tenant_select
on public.ticket_chats
for select to authenticated
using (public.can_access_company(company_id));

create policy ticket_chats_tenant_insert
on public.ticket_chats
for insert to authenticated
with check (public.can_access_company(company_id) and sender_id = auth.uid());

create policy ticket_chats_tenant_update
on public.ticket_chats
for update to authenticated
using (public.can_access_company(company_id))
with check (public.can_access_company(company_id));

create policy ticket_chats_tenant_delete
on public.ticket_chats
for delete to authenticated
using (public.can_access_company(company_id));

create policy live_locations_tenant_select
on public.live_locations
for select to authenticated
using (public.can_access_company(company_id));

create policy live_locations_tenant_insert
on public.live_locations
for insert to authenticated
with check (
  public.can_access_company(company_id)
  and (public.is_platform_admin() or user_id = auth.uid())
);

create policy live_locations_tenant_update
on public.live_locations
for update to authenticated
using (public.can_access_company(company_id))
with check (
  public.can_access_company(company_id)
  and (public.is_platform_admin() or user_id = auth.uid())
);

create policy live_locations_tenant_delete
on public.live_locations
for delete to authenticated
using (public.can_access_company(company_id));

create policy zone_profiles_tenant_select
on public.zone_profiles
for select to authenticated
using (public.can_access_company(company_id));

create policy zone_profiles_tenant_insert
on public.zone_profiles
for insert to authenticated
with check (public.can_access_company(company_id));

create policy zone_profiles_tenant_update
on public.zone_profiles
for update to authenticated
using (public.can_access_company(company_id))
with check (public.can_access_company(company_id));

create policy zone_profiles_tenant_delete
on public.zone_profiles
for delete to authenticated
using (public.can_access_company(company_id));

create policy engineer_zones_tenant_select
on public.engineer_zones
for select to authenticated
using (public.can_access_company(company_id));

create policy engineer_zones_tenant_insert
on public.engineer_zones
for insert to authenticated
with check (public.can_access_company(company_id));

create policy engineer_zones_tenant_update
on public.engineer_zones
for update to authenticated
using (public.can_access_company(company_id))
with check (public.can_access_company(company_id));

create policy engineer_zones_tenant_delete
on public.engineer_zones
for delete to authenticated
using (public.can_access_company(company_id));

create policy reporter_followups_tenant_select
on public.reporter_ticket_followups
for select to authenticated
using (public.can_access_company(company_id));

create policy reporter_followups_tenant_insert
on public.reporter_ticket_followups
for insert to authenticated
with check (public.can_access_company(company_id));

create policy reporter_followups_tenant_update
on public.reporter_ticket_followups
for update to authenticated
using (public.can_access_company(company_id))
with check (public.can_access_company(company_id));

create policy reporter_followups_tenant_delete
on public.reporter_ticket_followups
for delete to authenticated
using (public.can_access_company(company_id));

