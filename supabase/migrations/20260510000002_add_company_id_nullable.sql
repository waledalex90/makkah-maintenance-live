-- Phase 1 / Step 2: Add nullable company_id to operational tables

alter table public.profiles
  add column if not exists company_id uuid null references public.companies(id) on delete restrict;

alter table public.zones
  add column if not exists company_id uuid null references public.companies(id) on delete restrict;

alter table public.tickets
  add column if not exists company_id uuid null references public.companies(id) on delete restrict;

alter table public.ticket_attachments
  add column if not exists company_id uuid null references public.companies(id) on delete restrict;

alter table public.zone_profiles
  add column if not exists company_id uuid null references public.companies(id) on delete restrict;

alter table public.engineer_zones
  add column if not exists company_id uuid null references public.companies(id) on delete restrict;

alter table public.reporter_ticket_followups
  add column if not exists company_id uuid null references public.companies(id) on delete restrict;

alter table public.live_locations
  add column if not exists company_id uuid null references public.companies(id) on delete restrict;

alter table public.ticket_chats
  add column if not exists company_id uuid null references public.companies(id) on delete restrict;

create index if not exists idx_profiles_company_id
  on public.profiles(company_id);
create index if not exists idx_zones_company_id
  on public.zones(company_id);
create index if not exists idx_tickets_company_id
  on public.tickets(company_id);
create index if not exists idx_tickets_company_status_created
  on public.tickets(company_id, status, created_at desc);
create index if not exists idx_ticket_attachments_company_ticket
  on public.ticket_attachments(company_id, ticket_id);
create index if not exists idx_zone_profiles_company_profile
  on public.zone_profiles(company_id, profile_id);
create index if not exists idx_engineer_zones_company_engineer
  on public.engineer_zones(company_id, engineer_id);
create index if not exists idx_reporter_followups_company_ticket
  on public.reporter_ticket_followups(company_id, ticket_id);
create index if not exists idx_live_locations_company_user
  on public.live_locations(company_id, user_id);
create index if not exists idx_ticket_chats_company_ticket
  on public.ticket_chats(company_id, ticket_id);

