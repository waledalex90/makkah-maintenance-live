-- Live Tenant Isolation Validation (Phase 2.5)
-- Uses temporary company/tickets and restores original state.

create temporary table if not exists _tenant_validation_result (
  summary text not null
);
truncate table _tenant_validation_result;

do $$
declare
  user_a uuid := '6158d330-6c3c-404e-b9b8-d250240f790d';
  user_b uuid := '535228c6-aba4-4a7a-974a-d944b5169c7a';
  platform_admin uuid := '06440460-f025-4501-9ef8-d802dfaed009';
  company_a uuid := '57918bdd-054e-4fc7-9a06-a4edcc482834';

  old_user_b_company uuid;
  old_user_b_active_company uuid;
  company_b uuid := gen_random_uuid();
  company_b_slug text := 'tenant-test-b-' || replace(gen_random_uuid()::text, '-', '');
  ticket_a uuid;
  ticket_b uuid;
  logs text := '';
begin
  select company_id, active_company_id
    into old_user_b_company, old_user_b_active_company
  from public.profiles
  where id = user_b;

  -- Setup test tenant B + membership
  insert into public.companies (id, name, slug, subscription_plan, status)
  values (company_b, 'Tenant Isolation Test B', company_b_slug, 'enterprise', 'active');

  update public.profiles
  set company_id = company_b,
      active_company_id = company_b
  where id = user_b;

  insert into public.company_memberships (user_id, company_id, role_id, status, is_owner)
  select p.id, company_b, p.role_id, 'active', false
  from public.profiles p
  where p.id = user_b
  on conflict (user_id, company_id) do update set status = 'active';

  update public.profiles
  set active_company_id = company_a
  where id = user_a;

  -- Create one ticket per company
  insert into public.tickets (location, description, status, created_by, company_id)
  values ('Test A', 'Isolation ticket A', 'not_received', user_a, company_a)
  returning id into ticket_a;

  insert into public.tickets (location, description, status, created_by, company_id)
  values ('Test B', 'Isolation ticket B', 'not_received', user_b, company_b)
  returning id into ticket_b;

  -- Simulate authenticated USER A
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', user_a::text, true);

  -- A should not read B ticket
  if exists (select 1 from public.tickets where id = ticket_b) then
    logs := logs || E'FAIL: User A can read Company B ticket\n';
  else
    logs := logs || E'PASS: User A cannot read Company B ticket\n';
  end if;

  -- A should fail to INSERT chat into B ticket
  begin
    insert into public.ticket_chats (ticket_id, sender_id, message_text, company_id)
    values (ticket_b, user_a, 'forbidden cross-tenant chat', company_b);
    logs := logs || E'FAIL: User A inserted chat into Company B ticket\n';
  exception when others then
    logs := logs || E'PASS: User A blocked from inserting chat into Company B ticket\n';
  end;

  -- A should insert chat into A ticket
  begin
    insert into public.ticket_chats (ticket_id, sender_id, message_text, company_id)
    values (ticket_a, user_a, 'allowed same-tenant chat', company_a);
    logs := logs || E'PASS: User A inserted chat into Company A ticket\n';
  exception when others then
    logs := logs || E'FAIL: User A could not insert chat into Company A ticket\n';
  end;

  -- Platform admin bypass
  perform set_config('request.jwt.claim.sub', platform_admin::text, true);
  if exists (select 1 from public.tickets where id = ticket_a)
     and exists (select 1 from public.tickets where id = ticket_b) then
    logs := logs || E'PASS: Platform admin can read both tenants\n';
  else
    logs := logs || E'FAIL: Platform admin cannot read across tenants\n';
  end if;

  -- Cleanup (back to default role for unrestricted cleanup)
  execute 'reset role';
  delete from public.ticket_chats where ticket_id in (ticket_a, ticket_b);
  delete from public.tickets where id in (ticket_a, ticket_b);
  delete from public.company_memberships where company_id = company_b;
  update public.profiles
  set company_id = old_user_b_company,
      active_company_id = old_user_b_active_company
  where id = user_b;
  delete from public.companies where id = company_b;

  insert into _tenant_validation_result(summary)
  values (E'--- Phase 2.5 Tenant Isolation ---\n' || logs);
end $$;

select summary from _tenant_validation_result;

