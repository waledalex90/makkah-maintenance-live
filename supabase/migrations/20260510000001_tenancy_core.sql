-- Phase 1 / Step 1: Tenancy core tables and active company context

create extension if not exists pgcrypto;

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  subscription_plan text not null default 'basic',
  company_logo_url text null,
  status text not null default 'active' check (status in ('active', 'trial', 'suspended', 'cancelled')),
  billing_customer_id text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists active_company_id uuid null references public.companies(id) on delete set null;

create table if not exists public.company_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  role_id uuid null references public.roles(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'invited', 'suspended')),
  is_owner boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, company_id)
);

create index if not exists idx_company_memberships_company_user
  on public.company_memberships(company_id, user_id);
create index if not exists idx_company_memberships_user
  on public.company_memberships(user_id);
create index if not exists idx_company_memberships_company_status
  on public.company_memberships(company_id, status);
create index if not exists idx_profiles_active_company_id
  on public.profiles(active_company_id);

create or replace function public.touch_updated_at_generic()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_companies_updated_at on public.companies;
create trigger trg_companies_updated_at
before update on public.companies
for each row execute function public.touch_updated_at_generic();

drop trigger if exists trg_company_memberships_updated_at on public.company_memberships;
create trigger trg_company_memberships_updated_at
before update on public.company_memberships
for each row execute function public.touch_updated_at_generic();

-- Seed current protected super admin as platform admin.
insert into public.platform_admins (user_id, is_active)
select u.id, true
from auth.users u
where lower(u.email) = lower('waledalex90@gmail.com')
on conflict (user_id) do nothing;

create or replace function public.current_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.active_company_id
  from public.profiles p
  where p.id = auth.uid()
$$;

