-- =========================================================
-- Migration: Add admin role, zones, and engineer-zone scope
-- =========================================================

alter type public.app_role add value if not exists 'admin';

create table if not exists public.zones (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  center_latitude double precision not null check (center_latitude between -90 and 90),
  center_longitude double precision not null check (center_longitude between -180 and 180),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.engineer_zones (
  engineer_id uuid not null references public.profiles(id) on delete cascade,
  zone_id uuid not null references public.zones(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (engineer_id, zone_id)
);

create index if not exists idx_engineer_zones_zone_id on public.engineer_zones(zone_id);

drop trigger if exists trg_zones_updated_at on public.zones;
create trigger trg_zones_updated_at
before update on public.zones
for each row execute function public.set_updated_at();

alter table public.tickets
  add column if not exists zone_id uuid references public.zones(id) on delete restrict;

create index if not exists idx_tickets_zone_id on public.tickets(zone_id);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- Compare as text to avoid "new enum value must be committed" in same transaction.
  select public.current_user_role()::text = 'admin'
$$;

create or replace function public.is_engineer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_role() = 'engineer'::public.app_role
$$;

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
      when (select role from me)::text = 'admin' then true
      when (select role from me) = 'engineer'::public.app_role then
        exists (
          select 1
          from t
          join public.engineer_zones ez on ez.zone_id = t.zone_id
          where ez.engineer_id = (select uid from me)
        )
      when (select role from me) = 'supervisor'::public.app_role then
        exists (
          select 1
          from t
          left join public.profiles tech on tech.id = t.assigned_technician_id
          where
            t.assigned_supervisor_id = (select uid from me)
            or tech.supervisor_id = (select uid from me)
        )
      when (select role from me) = 'technician'::public.app_role then
        exists (
          select 1
          from t
          where t.assigned_technician_id = (select uid from me)
        )
      else false
    end
$$;

alter table public.zones enable row level security;
alter table public.zones force row level security;

alter table public.engineer_zones enable row level security;
alter table public.engineer_zones force row level security;

drop policy if exists "profiles_select_policy" on public.profiles;
create policy "profiles_select_policy"
on public.profiles
for select
to authenticated
using (
  public.is_admin()
  or id = auth.uid()
  or (
    public.current_user_role() = 'supervisor'::public.app_role
    and supervisor_id = auth.uid()
  )
);

drop policy if exists "profiles_insert_policy" on public.profiles;
create policy "profiles_insert_policy"
on public.profiles
for insert
to authenticated
with check (
  public.is_admin()
  or id = auth.uid()
);

drop policy if exists "profiles_update_policy" on public.profiles;
create policy "profiles_update_policy"
on public.profiles
for update
to authenticated
using (
  public.is_admin()
  or id = auth.uid()
)
with check (
  public.is_admin()
  or id = auth.uid()
);

drop policy if exists "profiles_delete_policy" on public.profiles;
create policy "profiles_delete_policy"
on public.profiles
for delete
to authenticated
using (public.is_admin());

drop policy if exists "tickets_select_policy" on public.tickets;
create policy "tickets_select_policy"
on public.tickets
for select
to authenticated
using (public.can_access_ticket(id));

drop policy if exists "tickets_insert_policy" on public.tickets;
create policy "tickets_insert_policy"
on public.tickets
for insert
to authenticated
with check (
  public.is_admin()
  or (
    public.current_user_role() = 'supervisor'::public.app_role
    and assigned_supervisor_id = auth.uid()
  )
);

drop policy if exists "tickets_update_policy" on public.tickets;
create policy "tickets_update_policy"
on public.tickets
for update
to authenticated
using (public.can_access_ticket(id))
with check (
  public.is_admin()
  or (
    public.current_user_role() = 'supervisor'::public.app_role
    and (
      assigned_supervisor_id = auth.uid()
      or exists (
        select 1
        from public.profiles tech
        where tech.id = assigned_technician_id
          and tech.supervisor_id = auth.uid()
      )
    )
  )
  or (
    public.current_user_role() = 'technician'::public.app_role
    and assigned_technician_id = auth.uid()
  )
);

drop policy if exists "tickets_delete_policy" on public.tickets;
create policy "tickets_delete_policy"
on public.tickets
for delete
to authenticated
using (public.is_admin());

drop policy if exists "ticket_chats_select_policy" on public.ticket_chats;
create policy "ticket_chats_select_policy"
on public.ticket_chats
for select
to authenticated
using (public.can_access_ticket(ticket_id));

drop policy if exists "ticket_chats_insert_policy" on public.ticket_chats;
create policy "ticket_chats_insert_policy"
on public.ticket_chats
for insert
to authenticated
with check (
  public.can_access_ticket(ticket_id)
  and sender_id = auth.uid()
);

drop policy if exists "ticket_chats_update_policy" on public.ticket_chats;
create policy "ticket_chats_update_policy"
on public.ticket_chats
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "ticket_chats_delete_policy" on public.ticket_chats;
create policy "ticket_chats_delete_policy"
on public.ticket_chats
for delete
to authenticated
using (public.is_admin());

drop policy if exists "live_locations_select_policy" on public.live_locations;
create policy "live_locations_select_policy"
on public.live_locations
for select
to authenticated
using (
  public.is_admin()
  or user_id = auth.uid()
  or (
    public.current_user_role() = 'supervisor'::public.app_role
    and exists (
      select 1
      from public.profiles p
      where p.id = user_id
        and p.supervisor_id = auth.uid()
    )
  )
);

drop policy if exists "live_locations_delete_policy" on public.live_locations;
create policy "live_locations_delete_policy"
on public.live_locations
for delete
to authenticated
using (public.is_admin());

drop policy if exists "zones_select_policy" on public.zones;
create policy "zones_select_policy"
on public.zones
for select
to authenticated
using (
  public.is_admin()
  or (
    public.is_engineer()
    and exists (
      select 1
      from public.engineer_zones ez
      where ez.zone_id = zones.id
        and ez.engineer_id = auth.uid()
    )
  )
  or public.current_user_role() in ('supervisor'::public.app_role, 'technician'::public.app_role)
);

drop policy if exists "zones_write_policy" on public.zones;
create policy "zones_write_policy"
on public.zones
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "engineer_zones_select_policy" on public.engineer_zones;
create policy "engineer_zones_select_policy"
on public.engineer_zones
for select
to authenticated
using (
  public.is_admin()
  or engineer_id = auth.uid()
);

drop policy if exists "engineer_zones_write_policy" on public.engineer_zones;
create policy "engineer_zones_write_policy"
on public.engineer_zones
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'zones'
  ) then
    alter publication supabase_realtime add table public.zones;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'engineer_zones'
  ) then
    alter publication supabase_realtime add table public.engineer_zones;
  end if;
end $$;
