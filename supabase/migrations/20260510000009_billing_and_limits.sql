-- Phase 5: Subscription plans, usage limits, and invoice skeleton

create table if not exists public.subscription_plans (
  plan_key text primary key,
  display_name text not null,
  price_monthly numeric(12,2) not null default 0,
  max_technicians int null,
  max_tickets_per_month int null,
  max_zones int null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.subscription_plans (plan_key, display_name, price_monthly, max_technicians, max_tickets_per_month, max_zones, is_active)
values
  ('basic', 'Basic', 199.00, 10, 300, 20, true),
  ('pro', 'Pro', 499.00, 50, 2000, 100, true),
  ('enterprise', 'Enterprise', 0.00, null, null, null, true)
on conflict (plan_key) do update
set display_name = excluded.display_name,
    price_monthly = excluded.price_monthly,
    max_technicians = excluded.max_technicians,
    max_tickets_per_month = excluded.max_tickets_per_month,
    max_zones = excluded.max_zones,
    is_active = excluded.is_active;

alter table public.companies
  add constraint companies_subscription_plan_fk
  foreign key (subscription_plan)
  references public.subscription_plans(plan_key);

create table if not exists public.company_invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  plan_key text not null references public.subscription_plans(plan_key),
  amount numeric(12,2) not null,
  currency text not null default 'SAR',
  invoice_status text not null default 'draft' check (invoice_status in ('draft', 'issued', 'paid', 'void')),
  period_start date not null,
  period_end date not null,
  issued_at timestamptz null,
  due_at timestamptz null,
  paid_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_company_invoices_company_period
  on public.company_invoices(company_id, period_start desc);
create index if not exists idx_company_invoices_status
  on public.company_invoices(invoice_status);

drop trigger if exists trg_company_invoices_updated_at on public.company_invoices;
create trigger trg_company_invoices_updated_at
before update on public.company_invoices
for each row execute function public.touch_updated_at_generic();

create or replace function public.company_plan_limit(p_company_id uuid, p_limit_key text)
returns int
language sql
stable
as $$
  select case
    when p_limit_key = 'technicians' then sp.max_technicians
    when p_limit_key = 'tickets_per_month' then sp.max_tickets_per_month
    when p_limit_key = 'zones' then sp.max_zones
    else null
  end
  from public.companies c
  join public.subscription_plans sp on sp.plan_key = c.subscription_plan
  where c.id = p_company_id
$$;

create or replace function public.enforce_company_limits_profiles()
returns trigger
language plpgsql
as $$
declare
  v_limit int;
  v_count int;
  v_target_company uuid;
begin
  v_target_company := new.company_id;
  if v_target_company is null then
    return new;
  end if;

  if coalesce(new.role, '') not in ('technician', 'engineer', 'supervisor') then
    return new;
  end if;

  v_limit := public.company_plan_limit(v_target_company, 'technicians');
  if v_limit is null then
    return new;
  end if;

  select count(*)::int
  into v_count
  from public.profiles p
  where p.company_id = v_target_company
    and p.role in ('technician', 'engineer', 'supervisor')
    and p.id <> new.id;

  if (v_count + 1) > v_limit then
    raise exception 'Technician limit exceeded for company % (limit=%).', v_target_company, v_limit;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_company_limits_profiles on public.profiles;
create trigger trg_enforce_company_limits_profiles
before insert or update of role, company_id on public.profiles
for each row execute function public.enforce_company_limits_profiles();

create or replace function public.enforce_company_limits_zones()
returns trigger
language plpgsql
as $$
declare
  v_limit int;
  v_count int;
begin
  if new.company_id is null then
    return new;
  end if;

  v_limit := public.company_plan_limit(new.company_id, 'zones');
  if v_limit is null then
    return new;
  end if;

  select count(*)::int
  into v_count
  from public.zones z
  where z.company_id = new.company_id
    and z.id <> new.id;

  if (v_count + 1) > v_limit then
    raise exception 'Zone limit exceeded for company % (limit=%).', new.company_id, v_limit;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_company_limits_zones on public.zones;
create trigger trg_enforce_company_limits_zones
before insert or update of company_id on public.zones
for each row execute function public.enforce_company_limits_zones();

create or replace function public.enforce_company_limits_tickets()
returns trigger
language plpgsql
as $$
declare
  v_limit int;
  v_count int;
  v_from timestamptz;
  v_to timestamptz;
begin
  if new.company_id is null then
    return new;
  end if;

  v_limit := public.company_plan_limit(new.company_id, 'tickets_per_month');
  if v_limit is null then
    return new;
  end if;

  v_from := date_trunc('month', now());
  v_to := v_from + interval '1 month';

  select count(*)::int
  into v_count
  from public.tickets t
  where t.company_id = new.company_id
    and t.created_at >= v_from
    and t.created_at < v_to
    and t.id <> new.id;

  if (v_count + 1) > v_limit then
    raise exception 'Monthly ticket limit exceeded for company % (limit=%).', new.company_id, v_limit;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_company_limits_tickets on public.tickets;
create trigger trg_enforce_company_limits_tickets
before insert on public.tickets
for each row execute function public.enforce_company_limits_tickets();

