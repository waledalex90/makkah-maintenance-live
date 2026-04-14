-- Phase 1 / Step 4: Harden constraints after successful backfill

do $$
begin
  if exists (select 1 from public.profiles where company_id is null) then
    raise exception 'profiles.company_id still has null values';
  end if;
  if exists (select 1 from public.tickets where company_id is null) then
    raise exception 'tickets.company_id still has null values';
  end if;
  if exists (select 1 from public.zones where company_id is null) then
    raise exception 'zones.company_id still has null values';
  end if;
end $$;

alter table public.profiles alter column company_id set not null;
alter table public.tickets alter column company_id set not null;
alter table public.zones alter column company_id set not null;
alter table public.ticket_attachments alter column company_id set not null;
alter table public.zone_profiles alter column company_id set not null;
alter table public.engineer_zones alter column company_id set not null;
alter table public.reporter_ticket_followups alter column company_id set not null;
alter table public.live_locations alter column company_id set not null;
alter table public.ticket_chats alter column company_id set not null;

-- Optional tenant-scoped uniqueness example (enable later if needed):
-- alter table public.zones drop constraint if exists zones_name_key;
-- create unique index if not exists uq_zones_company_name
--   on public.zones(company_id, name);

