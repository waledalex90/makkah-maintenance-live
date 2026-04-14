-- =========================================================
-- Supabase SQL: Hajj maintenance ticketing system
-- Single company + strict RLS
-- =========================================================

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('engineer', 'supervisor', 'technician');
  end if;

  if not exists (select 1 from pg_type where typname = 'ticket_status') then
    create type public.ticket_status as enum ('new', 'assigned', 'on_the_way', 'arrived', 'fixed');
  end if;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  mobile text not null,
  role public.app_role not null,
  supervisor_id uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  location text not null,
  description text not null,
  status public.ticket_status not null default 'new',
  assigned_engineer_id uuid null references public.profiles(id) on delete set null,
  assigned_supervisor_id uuid null references public.profiles(id) on delete set null,
  assigned_technician_id uuid null references public.profiles(id) on delete set null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ticket_chats (
  id bigint generated always as identity primary key,
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  message_text text not null check (length(trim(message_text)) > 0),
  sent_at timestamptz not null default now()
);

create table if not exists public.live_locations (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  last_updated timestamptz not null default now()
);

create index if not exists idx_profiles_supervisor_id on public.profiles(supervisor_id);
create index if not exists idx_tickets_assigned_engineer on public.tickets(assigned_engineer_id);
create index if not exists idx_tickets_assigned_supervisor on public.tickets(assigned_supervisor_id);
create index if not exists idx_tickets_assigned_technician on public.tickets(assigned_technician_id);
create index if not exists idx_tickets_status on public.tickets(status);
create index if not exists idx_ticket_chats_ticket_id on public.ticket_chats(ticket_id);
create index if not exists idx_ticket_chats_sent_at on public.ticket_chats(sent_at);
create index if not exists idx_live_locations_last_updated on public.live_locations(last_updated);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists trg_tickets_updated_at on public.tickets;
create trigger trg_tickets_updated_at
before update on public.tickets
for each row execute function public.set_updated_at();

create or replace function public.set_last_updated()
returns trigger
language plpgsql
as $$
begin
  new.last_updated = now();
  return new;
end;
$$;

drop trigger if exists trg_live_locations_last_updated on public.live_locations;
create trigger trg_live_locations_last_updated
before insert or update on public.live_locations
for each row execute function public.set_last_updated();

create or replace function public.current_user_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid()
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
      when (select role from me) = 'engineer'::public.app_role then true
      when (select role from me) = 'technician'::public.app_role then
        exists (
          select 1 from t
          where assigned_technician_id = (select uid from me)
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
      else false
    end
$$;

create or replace function public.can_write_live_location_for_target(p_target_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select auth.uid() as uid, public.current_user_role() as role
  ),
  target as (
    select role from public.profiles where id = p_target_user
  )
  select
    case
      when (select role from me) = 'engineer'::public.app_role then true
      when (select uid from me) = p_target_user
       and (select role from me) in ('supervisor'::public.app_role, 'technician'::public.app_role)
       and exists (select 1 from target where role in ('supervisor'::public.app_role, 'technician'::public.app_role))
      then true
      else false
    end
$$;

alter table public.profiles enable row level security;
alter table public.profiles force row level security;
alter table public.tickets enable row level security;
alter table public.tickets force row level security;
alter table public.ticket_chats enable row level security;
alter table public.ticket_chats force row level security;
alter table public.live_locations enable row level security;
alter table public.live_locations force row level security;

drop policy if exists "profiles_select_policy" on public.profiles;
create policy "profiles_select_policy" on public.profiles
for select to authenticated
using (
  public.is_engineer()
  or id = auth.uid()
  or (
    public.current_user_role() = 'supervisor'::public.app_role
    and supervisor_id = auth.uid()
  )
);

drop policy if exists "profiles_insert_policy" on public.profiles;
create policy "profiles_insert_policy" on public.profiles
for insert to authenticated
with check (
  public.is_engineer()
  or id = auth.uid()
);

drop policy if exists "profiles_update_policy" on public.profiles;
create policy "profiles_update_policy" on public.profiles
for update to authenticated
using (
  public.is_engineer()
  or id = auth.uid()
)
with check (
  public.is_engineer()
  or id = auth.uid()
);

drop policy if exists "profiles_delete_policy" on public.profiles;
create policy "profiles_delete_policy" on public.profiles
for delete to authenticated
using (public.is_engineer());

drop policy if exists "tickets_select_policy" on public.tickets;
create policy "tickets_select_policy" on public.tickets
for select to authenticated
using (public.can_access_ticket(id));

drop policy if exists "tickets_insert_policy" on public.tickets;
create policy "tickets_insert_policy" on public.tickets
for insert to authenticated
with check (
  public.is_engineer()
  or (
    public.current_user_role() = 'supervisor'::public.app_role
    and assigned_supervisor_id = auth.uid()
  )
);

drop policy if exists "tickets_update_policy" on public.tickets;
create policy "tickets_update_policy" on public.tickets
for update to authenticated
using (public.can_access_ticket(id))
with check (
  public.is_engineer()
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
create policy "tickets_delete_policy" on public.tickets
for delete to authenticated
using (public.is_engineer());

drop policy if exists "ticket_chats_select_policy" on public.ticket_chats;
create policy "ticket_chats_select_policy" on public.ticket_chats
for select to authenticated
using (public.can_access_ticket(ticket_id));

drop policy if exists "ticket_chats_insert_policy" on public.ticket_chats;
create policy "ticket_chats_insert_policy" on public.ticket_chats
for insert to authenticated
with check (
  public.can_access_ticket(ticket_id)
  and sender_id = auth.uid()
);

drop policy if exists "ticket_chats_update_policy" on public.ticket_chats;
create policy "ticket_chats_update_policy" on public.ticket_chats
for update to authenticated
using (public.is_engineer())
with check (public.is_engineer());

drop policy if exists "ticket_chats_delete_policy" on public.ticket_chats;
create policy "ticket_chats_delete_policy" on public.ticket_chats
for delete to authenticated
using (public.is_engineer());

drop policy if exists "live_locations_select_policy" on public.live_locations;
create policy "live_locations_select_policy" on public.live_locations
for select to authenticated
using (
  public.is_engineer()
  or user_id = auth.uid()
  or (
    public.current_user_role() = 'supervisor'::public.app_role
    and (
      user_id = auth.uid()
      or exists (
        select 1
        from public.profiles p
        where p.id = user_id
          and p.supervisor_id = auth.uid()
      )
    )
  )
);

drop policy if exists "live_locations_insert_policy" on public.live_locations;
create policy "live_locations_insert_policy" on public.live_locations
for insert to authenticated
with check (public.can_write_live_location_for_target(user_id));

drop policy if exists "live_locations_update_policy" on public.live_locations;
create policy "live_locations_update_policy" on public.live_locations
for update to authenticated
using (public.can_write_live_location_for_target(user_id))
with check (public.can_write_live_location_for_target(user_id));

drop policy if exists "live_locations_delete_policy" on public.live_locations;
create policy "live_locations_delete_policy" on public.live_locations
for delete to authenticated
using (public.is_engineer());

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tickets'
  ) then
    alter publication supabase_realtime add table public.tickets;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ticket_chats'
  ) then
    alter publication supabase_realtime add table public.ticket_chats;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'live_locations'
  ) then
    alter publication supabase_realtime add table public.live_locations;
  end if;
end $$;
