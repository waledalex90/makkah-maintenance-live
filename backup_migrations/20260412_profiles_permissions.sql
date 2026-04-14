-- Granular JSON permissions for profiles (e.g. view_admin_reports for non-default roles)
alter table public.profiles
  add column if not exists permissions jsonb not null default '{}'::jsonb;

create index if not exists idx_profiles_permissions_gin on public.profiles using gin (permissions);
