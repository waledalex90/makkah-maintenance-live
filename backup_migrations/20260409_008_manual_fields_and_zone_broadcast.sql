-- =========================================================
-- Migration: Manual entry fields + zone-based notifications
-- =========================================================

alter table public.tickets
  add column if not exists external_ticket_number text,
  add column if not exists reporter_name text,
  add column if not exists shaqes_notes text;

create index if not exists idx_tickets_external_ticket_number on public.tickets(external_ticket_number);

create table if not exists public.zone_profiles (
  zone_id uuid not null references public.zones(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (zone_id, profile_id)
);

create index if not exists idx_zone_profiles_profile_id on public.zone_profiles(profile_id);

create table if not exists public.zone_notifications (
  id bigint generated always as identity primary key,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  zone_id uuid not null references public.zones(id) on delete cascade,
  title text not null,
  body text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_zone_notifications_recipient_created
  on public.zone_notifications(recipient_id, created_at desc);

create or replace function public.create_zone_notifications_for_ticket()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.zone_id is null then
    return new;
  end if;

  insert into public.zone_notifications (recipient_id, ticket_id, zone_id, title, body)
  select
    zp.profile_id,
    new.id,
    new.zone_id,
    'بلاغ جديد',
    coalesce(new.title, 'بدون عنوان') || ' - ' || left(coalesce(new.description, ''), 160)
  from public.zone_profiles zp
  where zp.zone_id = new.zone_id;

  return new;
end;
$$;

drop trigger if exists trg_tickets_create_zone_notifications on public.tickets;
create trigger trg_tickets_create_zone_notifications
after insert on public.tickets
for each row execute function public.create_zone_notifications_for_ticket();

alter table public.zone_profiles enable row level security;
alter table public.zone_profiles force row level security;
alter table public.zone_notifications enable row level security;
alter table public.zone_notifications force row level security;

drop policy if exists "zone_profiles_select_policy" on public.zone_profiles;
create policy "zone_profiles_select_policy"
on public.zone_profiles
for select
to authenticated
using (
  public.current_user_role()::text in ('admin', 'project_manager', 'projects_director')
  or profile_id = auth.uid()
);

drop policy if exists "zone_profiles_write_policy" on public.zone_profiles;
create policy "zone_profiles_write_policy"
on public.zone_profiles
for all
to authenticated
using (public.current_user_role()::text in ('admin', 'project_manager', 'projects_director'))
with check (public.current_user_role()::text in ('admin', 'project_manager', 'projects_director'));

drop policy if exists "zone_notifications_select_policy" on public.zone_notifications;
create policy "zone_notifications_select_policy"
on public.zone_notifications
for select
to authenticated
using (
  recipient_id = auth.uid()
  or public.current_user_role()::text in ('admin', 'project_manager', 'projects_director')
);

drop policy if exists "zone_notifications_update_policy" on public.zone_notifications;
create policy "zone_notifications_update_policy"
on public.zone_notifications
for update
to authenticated
using (
  recipient_id = auth.uid()
  or public.current_user_role()::text in ('admin', 'project_manager', 'projects_director')
)
with check (
  recipient_id = auth.uid()
  or public.current_user_role()::text in ('admin', 'project_manager', 'projects_director')
);

drop policy if exists "zone_notifications_insert_policy" on public.zone_notifications;
create policy "zone_notifications_insert_policy"
on public.zone_notifications
for insert
to authenticated
with check (false);

drop policy if exists "zone_notifications_delete_policy" on public.zone_notifications;
create policy "zone_notifications_delete_policy"
on public.zone_notifications
for delete
to authenticated
using (public.current_user_role()::text in ('admin', 'project_manager', 'projects_director'));

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'zone_notifications'
  ) then
    alter publication supabase_realtime add table public.zone_notifications;
  end if;
end $$;
