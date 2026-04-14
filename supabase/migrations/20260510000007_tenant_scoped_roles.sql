-- Phase 3: Tenant-scoped roles (global + company roles)

alter table public.roles
  add column if not exists company_id uuid null references public.companies(id) on delete cascade;

create index if not exists idx_roles_company_id
  on public.roles(company_id);

-- Existing custom roles become company-scoped when possible (single-tenant backfill).
update public.roles r
set company_id = p.company_id
from public.profiles p
where r.id = p.role_id
  and r.company_id is null
  and coalesce(r.is_system, false) = false
  and p.company_id is not null;

-- System roles must remain global.
update public.roles
set company_id = null
where coalesce(is_system, false) = true;

-- Replace global uniqueness with scoped uniqueness.
alter table public.roles
  drop constraint if exists roles_role_key_key;

drop index if exists public.roles_role_key_key;
drop index if exists public.idx_roles_role_key_normalized;

create unique index if not exists uq_roles_global_role_key
  on public.roles(role_key)
  where company_id is null;

create unique index if not exists uq_roles_company_role_key
  on public.roles(company_id, role_key)
  where company_id is not null;

-- A system role can never belong to a company.
alter table public.roles
  drop constraint if exists roles_system_company_scope_check;

alter table public.roles
  add constraint roles_system_company_scope_check
  check (
    (coalesce(is_system, false) = true and company_id is null)
    or (coalesce(is_system, false) = false)
  );

