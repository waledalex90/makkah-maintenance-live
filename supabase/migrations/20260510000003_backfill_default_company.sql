-- Phase 1 / Step 3: Safe backfill for existing single-tenant data

insert into public.companies (name, slug, subscription_plan, status)
values ('Makkah Default Company', 'makkah-default', 'enterprise', 'active')
on conflict (slug) do nothing;

-- Backfill profiles first (source of user/company relation)
with c as (
  select id from public.companies where slug = 'makkah-default' limit 1
)
update public.profiles p
set company_id = coalesce(p.company_id, c.id),
    active_company_id = coalesce(p.active_company_id, c.id)
from c
where p.company_id is null
   or p.active_company_id is null;

with c as (
  select id from public.companies where slug = 'makkah-default' limit 1
)
update public.zones z
set company_id = c.id
from c
where z.company_id is null;

with c as (
  select id from public.companies where slug = 'makkah-default' limit 1
)
update public.tickets t
set company_id = c.id
from c
where t.company_id is null;

with c as (
  select id from public.companies where slug = 'makkah-default' limit 1
)
update public.ticket_attachments ta
set company_id = c.id
from c
where ta.company_id is null;

with c as (
  select id from public.companies where slug = 'makkah-default' limit 1
)
update public.zone_profiles zp
set company_id = c.id
from c
where zp.company_id is null;

with c as (
  select id from public.companies where slug = 'makkah-default' limit 1
)
update public.engineer_zones ez
set company_id = c.id
from c
where ez.company_id is null;

with c as (
  select id from public.companies where slug = 'makkah-default' limit 1
)
update public.reporter_ticket_followups rf
set company_id = c.id
from c
where rf.company_id is null;

with c as (
  select id from public.companies where slug = 'makkah-default' limit 1
)
update public.live_locations ll
set company_id = c.id
from c
where ll.company_id is null;

with c as (
  select id from public.companies where slug = 'makkah-default' limit 1
)
update public.ticket_chats tc
set company_id = c.id
from c
where tc.company_id is null;

-- Create membership for all existing profiles in default company.
insert into public.company_memberships (user_id, company_id, role_id, status, is_owner)
select
  p.id,
  p.company_id,
  p.role_id,
  'active',
  case when p.role::text = 'admin' then true else false end
from public.profiles p
where p.company_id is not null
on conflict (user_id, company_id) do update
set role_id = excluded.role_id,
    status = 'active';

