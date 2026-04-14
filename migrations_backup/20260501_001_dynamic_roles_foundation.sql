-- Dynamic RBAC foundation (backward-compatible).
-- Adds table-based roles while keeping legacy profiles.role enum for RLS compatibility.

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  role_key text not null unique,
  display_name text not null,
  permissions jsonb not null default '{}'::jsonb,
  legacy_role public.app_role null,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint roles_role_key_format check (role_key ~ '^[a-z0-9_]+$')
);

create unique index if not exists idx_roles_role_key_normalized on public.roles ((lower(role_key)));
create index if not exists idx_roles_legacy_role on public.roles (legacy_role);

create or replace function public.touch_roles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_roles_updated_at on public.roles;
create trigger trg_touch_roles_updated_at
before update on public.roles
for each row execute function public.touch_roles_updated_at();

alter table public.profiles
  add column if not exists role_id uuid null references public.roles(id) on delete set null;

create index if not exists idx_profiles_role_id on public.profiles(role_id);

insert into public.roles (role_key, display_name, legacy_role, is_system, permissions)
values
  ('admin', 'مدير النظام', 'admin', true, '{"view_dashboard": true, "view_tickets": true, "view_map": true, "view_reports": true, "manage_zones": true, "manage_users": true, "view_settings": true}'::jsonb),
  ('projects_director', 'مدير المشاريع', 'projects_director', true, '{"view_dashboard": true, "view_tickets": true, "view_map": true, "view_reports": true, "manage_zones": true, "manage_users": true, "view_settings": true}'::jsonb),
  ('project_manager', 'مدير مشروع', 'project_manager', true, '{"view_dashboard": true, "view_tickets": true, "view_map": true, "view_reports": true, "manage_zones": true, "manage_users": true, "view_settings": true}'::jsonb),
  ('engineer', 'مهندس', 'engineer', true, '{"view_dashboard": true, "view_tickets": true, "view_map": true, "view_reports": false, "manage_zones": false, "manage_users": false, "view_settings": true}'::jsonb),
  ('supervisor', 'مشرف', 'supervisor', true, '{"view_dashboard": true, "view_tickets": true, "view_map": true, "view_reports": false, "manage_zones": false, "manage_users": false, "view_settings": true}'::jsonb),
  ('technician', 'فني', 'technician', true, '{"view_dashboard": true, "view_tickets": true, "view_map": true, "view_reports": false, "manage_zones": false, "manage_users": false, "view_settings": true}'::jsonb),
  ('reporter', 'مبلّغ بلاغ', 'reporter', true, '{"view_dashboard": true, "view_tickets": true, "view_map": false, "view_reports": false, "manage_zones": false, "manage_users": false, "view_settings": true}'::jsonb),
  ('data_entry', 'إدخال بيانات (عمليات)', 'data_entry', true, '{"view_dashboard": true, "view_tickets": true, "view_map": true, "view_reports": false, "manage_zones": false, "manage_users": false, "view_settings": true}'::jsonb)
on conflict (role_key) do update set
  display_name = excluded.display_name,
  legacy_role = excluded.legacy_role,
  is_system = excluded.is_system,
  permissions = excluded.permissions;

update public.profiles p
set role_id = r.id
from public.roles r
where r.role_key = p.role::text
  and p.role_id is null;

