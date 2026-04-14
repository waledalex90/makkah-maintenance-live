-- Tenant Isolation Validation Script (Phase 2.5)
-- Run in Supabase SQL Editor.
-- Replace placeholders before running:
--   :USER_A_ID, :USER_B_ID, :PLATFORM_ADMIN_ID, :COMPANY_A_ID, :COMPANY_B_ID

do $$
declare
  user_a uuid := '11111111-1111-1111-1111-111111111111';
  user_b uuid := '22222222-2222-2222-2222-222222222222';
  platform_admin uuid := '99999999-9999-9999-9999-999999999999';
  company_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  company_b uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  ticket_a uuid;
  ticket_b uuid;
  result_log text := '';
begin
  -- Preconditions sanity checks
  if not exists (select 1 from public.profiles where id = user_a and company_id = company_a) then
    raise exception 'Precondition failed: USER_A profile/company mismatch.';
  end if;
  if not exists (select 1 from public.profiles where id = user_b and company_id = company_b) then
    raise exception 'Precondition failed: USER_B profile/company mismatch.';
  end if;
  if not exists (select 1 from public.platform_admins where user_id = platform_admin and is_active) then
    raise exception 'Precondition failed: PLATFORM_ADMIN not active in platform_admins.';
  end if;

  -- Pick one ticket from each company (must exist)
  select t.id into ticket_a from public.tickets t where t.company_id = company_a limit 1;
  select t.id into ticket_b from public.tickets t where t.company_id = company_b limit 1;

  if ticket_a is null or ticket_b is null then
    raise exception 'Precondition failed: Need at least one ticket in each company.';
  end if;

  -- Helper: emulate authenticated user by role + JWT claim.
  execute 'set local role authenticated';

  -- Scenario 1: User A should NOT see/update Company B
  perform set_config('request.jwt.claim.sub', user_a::text, true);
  if exists (select 1 from public.tickets where id = ticket_b) then
    result_log := result_log || E'❌ User A read Company B ticket: FAIL\n';
  else
    result_log := result_log || E'✅ User A read Company B ticket: PASS\n';
  end if;

  update public.tickets
  set title = coalesce(title, '') || ''
  where id = ticket_b;
  if found then
    result_log := result_log || E'❌ User A update Company B ticket: FAIL\n';
  else
    result_log := result_log || E'✅ User A update Company B ticket: PASS\n';
  end if;

  -- Scenario 2: User A should see/update Company A
  if exists (select 1 from public.tickets where id = ticket_a) then
    result_log := result_log || E'✅ User A read Company A ticket: PASS\n';
  else
    result_log := result_log || E'❌ User A read Company A ticket: FAIL\n';
  end if;

  update public.tickets
  set updated_at = now()
  where id = ticket_a;
  if found then
    result_log := result_log || E'✅ User A update Company A ticket: PASS\n';
  else
    result_log := result_log || E'❌ User A update Company A ticket: FAIL\n';
  end if;

  -- Scenario 3: Platform Admin should access both companies
  perform set_config('request.jwt.claim.sub', platform_admin::text, true);
  if exists (select 1 from public.tickets where id = ticket_a)
     and exists (select 1 from public.tickets where id = ticket_b) then
    result_log := result_log || E'✅ Platform admin cross-company read: PASS\n';
  else
    result_log := result_log || E'❌ Platform admin cross-company read: FAIL\n';
  end if;

  raise notice E'--- Tenant Isolation Results ---\n%', result_log;
  execute 'reset role';
end $$;

