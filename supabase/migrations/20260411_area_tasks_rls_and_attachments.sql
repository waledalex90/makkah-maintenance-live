-- =========================================================
-- Area tasks workflow: profiles.region, tickets.category label,
-- attachment metadata, RLS so technicians/supervisors can read
-- open tickets in their zones (with specialty match) using auth.uid().
-- =========================================================

-- 1) profiles.region (optional human-readable zone name; zone_profiles remains authoritative for access)
alter table public.profiles
  add column if not exists region text;

-- 2) tickets.category — denormalized Arabic label from ticket_categories (for reporting / inspection parity with "التصنيف")
alter table public.tickets
  add column if not exists category text;

-- 3) ticket_attachments: display name + stable order
alter table public.ticket_attachments
  add column if not exists file_name text,
  add column if not exists sort_order integer not null default 0;

update public.ticket_attachments ta
set file_name = coalesce(file_name, split_part(ta.file_url, '/', -1))
where ta.file_name is null;

create index if not exists idx_ticket_attachments_ticket_sort
  on public.ticket_attachments(ticket_id, sort_order, id);

-- Sync tickets.category from ticket_categories.name
create or replace function public.trg_tickets_sync_category_label()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.category_id is null then
    new.category := null;
  else
    select tc.name into new.category
    from public.ticket_categories tc
    where tc.id = new.category_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_tickets_sync_category_label_ins on public.tickets;
create trigger trg_tickets_sync_category_label_ins
before insert on public.tickets
for each row execute function public.trg_tickets_sync_category_label();

drop trigger if exists trg_tickets_sync_category_label_upd on public.tickets;
create trigger trg_tickets_sync_category_label_upd
before update of category_id on public.tickets
for each row
when (new.category_id is distinct from old.category_id)
execute function public.trg_tickets_sync_category_label();

update public.tickets t
set category = tc.name
from public.ticket_categories tc
where t.category_id = tc.id
  and (t.category is null or t.category is distinct from tc.name);

-- Map ticket_categories row to profiles.specialty enum-style values
create or replace function public.category_id_matches_profile_specialty(p_category_id bigint, p_specialty text)
returns boolean
language sql
stable
set search_path = public
as $$
  select case
    when p_specialty is null then true
    when p_category_id is null then false
    else exists (
      select 1
      from public.ticket_categories tc
      where tc.id = p_category_id
        and (
          (p_specialty = 'fire' and (tc.name ilike '%حريق%' or tc.name ilike '%fire%'))
          or (p_specialty = 'electricity' and (tc.name ilike '%كهرباء%' or tc.name ilike '%electric%'))
          or (p_specialty = 'ac' and (tc.name ilike '%تكييف%' or tc.name ilike '%ac%' or tc.name ilike '%تبريد%'))
          or (p_specialty = 'civil' and (tc.name ilike '%مدنى%' or tc.name ilike '%مدني%' or tc.name ilike '%civil%'))
          or (p_specialty = 'kitchens' and (tc.name ilike '%مطابخ%' or tc.name ilike '%kitchen%'))
        )
    )
  end;
$$;

create or replace function public.can_access_ticket(p_ticket_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select auth.uid() as uid, public.current_user_role() as role
  ),
  t as (
    select *
    from public.tickets
    where id = p_ticket_id
  )
  select
    case
      when (select role from me)::text in ('admin', 'project_manager', 'projects_director') then true
      when (select role from me)::text = 'engineer' then
        exists (
          select 1
          from t
          join public.engineer_zones ez on ez.zone_id = t.zone_id
          where ez.engineer_id = (select uid from me)
        )
      when (select role from me)::text = 'supervisor' then
        exists (
          select 1
          from t
          left join public.profiles tech on tech.id = t.assigned_technician_id
          where
            t.assigned_supervisor_id = (select uid from me)
            or tech.supervisor_id = (select uid from me)
        )
        or exists (
          select 1
          from t
          join public.profiles prof on prof.id = (select uid from me)
          join public.zone_profiles zp on zp.profile_id = prof.id and zp.zone_id = t.zone_id
          where t.status::text in ('new', 'assigned', 'on_the_way', 'arrived')
            and (
              prof.specialty is null
              or public.category_id_matches_profile_specialty(t.category_id, prof.specialty)
            )
            and (
              prof.region is null
              or not exists (select 1 from public.zones z where z.id = t.zone_id)
              or prof.region = (select z.name from public.zones z where z.id = t.zone_id limit 1)
            )
        )
      when (select role from me)::text = 'technician' then
        exists (
          select 1
          from t
          where t.assigned_technician_id = (select uid from me)
        )
        or exists (
          select 1
          from t
          join public.profiles prof on prof.id = (select uid from me)
          join public.zone_profiles zp on zp.profile_id = prof.id and zp.zone_id = t.zone_id
          where t.status::text in ('new', 'assigned', 'on_the_way', 'arrived')
            and public.category_id_matches_profile_specialty(t.category_id, prof.specialty)
            and (
              prof.region is null
              or not exists (select 1 from public.zones z where z.id = t.zone_id)
              or prof.region = (select z.name from public.zones z where z.id = t.zone_id limit 1)
            )
        )
      when (select role from me)::text = 'reporter' then
        exists (
          select 1
          from t
          where t.created_by = (select uid from me)
        )
      else false
    end;
$$;
