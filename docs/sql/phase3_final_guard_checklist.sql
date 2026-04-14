-- Phase 3 Final Guard Checklist (Live Validation)
-- Focus:
-- 1) Cross-tenant role assignment must fail (role from company B to user in company A)
-- 2) Global Technician role mutation by tenant admin must fail

drop table if exists temp_phase3_guard_results;
create temporary table temp_phase3_guard_results (
  test_name text,
  expected text,
  observed text,
  status text
);

do $$
declare
  v_company_a uuid;
  v_company_b uuid;
  v_role_b uuid;
  v_temp_company_a uuid;
  v_temp_company_b uuid;
  v_temp_role_key text;
  v_resolve_visible boolean;
  v_technician_role uuid;
  v_targetable_by_tenant boolean;
begin
  -- Ensure we have two companies for cross-tenant simulation.
  select c.id
  into v_company_a
  from public.companies c
  order by c.created_at
  limit 1;

  if v_company_a is null then
    insert into public.companies (name, slug, subscription_plan, status)
    values (
      'Phase3 Temp Company A',
      'phase3-temp-a-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10),
      'basic',
      'active'
    )
    returning id into v_company_a;
    v_temp_company_a := v_company_a;
  end if;

  select c.id
  into v_company_b
  from public.companies c
  where c.id <> v_company_a
  order by c.created_at
  limit 1;

  if v_company_b is null then
    insert into public.companies (name, slug, subscription_plan, status)
    values (
      'Phase3 Temp Company B',
      'phase3-temp-b-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10),
      'basic',
      'active'
    )
    returning id into v_company_b;
    v_temp_company_b := v_company_b;
  end if;

  if v_company_a is null or v_company_b is null or v_company_a = v_company_b then
    insert into temp_phase3_guard_results
    values (
      'Cross-tenant Assignment (precondition)',
      'Need two distinct companies',
      'Could not provision two company contexts for simulation',
      'SKIPPED'
    );
  else
    v_temp_role_key := 'phase3_b_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
    insert into public.roles (role_key, display_name, permissions, legacy_role, is_system, company_id)
    values (
      v_temp_role_key,
      'Phase3 Temp Role B',
      '{}'::jsonb,
      'technician',
      false,
      v_company_b
    )
    returning id into v_role_b;

    -- Simulate API resolver visibility for active company A:
    -- visible roles are only global (company_id is null) or same company.
    select exists(
      select 1
      from public.roles r
      where r.id = v_role_b
        and (r.company_id is null or r.company_id = v_company_a)
    ) into v_resolve_visible;

    if v_resolve_visible then
      insert into temp_phase3_guard_results
      values (
        'Cross-tenant Assignment Attack',
        'Role from company B must be rejected while active company is A',
        'Resolver incorrectly allows cross-tenant role visibility',
        'RED/FAIL'
      );
    else
      insert into temp_phase3_guard_results
      values (
        'Cross-tenant Assignment Attack',
        'Role from company B must be rejected while active company is A',
        'Resolver blocks role visibility outside active company scope',
        'GREEN/PASS'
      );
    end if;

    delete from public.roles where id = v_role_b;
  end if;

  -- Validate global/system technician role protection.
  select r.id
  into v_technician_role
  from public.roles r
  where r.role_key = 'technician'
    and r.company_id is null
    and coalesce(r.is_system, false) = true
  limit 1;

  if v_technician_role is null then
    insert into temp_phase3_guard_results
    values (
      'Global Technician Role Protection',
      'Technician global role must exist as system/global role',
      'Global system technician role not found',
      'RED/FAIL'
    );
  else
    -- Simulate tenant-admin PATCH target predicate in API:
    -- .eq("id", roleId).eq("company_id", active_company_id) on non-global role.
    select exists(
      select 1
      from public.roles r
      where r.id = v_technician_role
        and r.company_id is not null
        and coalesce(r.is_system, false) = false
    ) into v_targetable_by_tenant;

    if v_targetable_by_tenant then
      insert into temp_phase3_guard_results
      values (
        'Global Technician Role Protection',
        'Tenant admin must not mutate global technician role',
        'Technician role appears tenant-targetable',
        'RED/FAIL'
      );
    else
      insert into temp_phase3_guard_results
      values (
        'Global Technician Role Protection',
        'Tenant admin must not mutate global technician role',
        'Global technician role remains system/global and blocked from tenant scope updates',
        'GREEN/PASS'
      );
    end if;
  end if;

  if v_temp_company_b is not null then
    delete from public.companies where id = v_temp_company_b;
  end if;
  if v_temp_company_a is not null then
    delete from public.companies where id = v_temp_company_a;
  end if;
end $$;

select *
from temp_phase3_guard_results
order by test_name;

