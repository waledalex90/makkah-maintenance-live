-- Down script for 20260510000006_rls_expansion.sql
-- Use ONLY for emergency rollback if workflows break after Phase 2.5 rollout.

-- 1) Drop new policies.
drop policy if exists ticket_chats_tenant_select on public.ticket_chats;
drop policy if exists ticket_chats_tenant_insert on public.ticket_chats;
drop policy if exists ticket_chats_tenant_update on public.ticket_chats;
drop policy if exists ticket_chats_tenant_delete on public.ticket_chats;

drop policy if exists live_locations_tenant_select on public.live_locations;
drop policy if exists live_locations_tenant_insert on public.live_locations;
drop policy if exists live_locations_tenant_update on public.live_locations;
drop policy if exists live_locations_tenant_delete on public.live_locations;

drop policy if exists zone_profiles_tenant_select on public.zone_profiles;
drop policy if exists zone_profiles_tenant_insert on public.zone_profiles;
drop policy if exists zone_profiles_tenant_update on public.zone_profiles;
drop policy if exists zone_profiles_tenant_delete on public.zone_profiles;

drop policy if exists engineer_zones_tenant_select on public.engineer_zones;
drop policy if exists engineer_zones_tenant_insert on public.engineer_zones;
drop policy if exists engineer_zones_tenant_update on public.engineer_zones;
drop policy if exists engineer_zones_tenant_delete on public.engineer_zones;

drop policy if exists reporter_followups_tenant_select on public.reporter_ticket_followups;
drop policy if exists reporter_followups_tenant_insert on public.reporter_ticket_followups;
drop policy if exists reporter_followups_tenant_update on public.reporter_ticket_followups;
drop policy if exists reporter_followups_tenant_delete on public.reporter_ticket_followups;

-- 2) Disable RLS on Phase 2.5 tables (fast recovery mode).
alter table public.ticket_chats disable row level security;
alter table public.live_locations disable row level security;
alter table public.zone_profiles disable row level security;
alter table public.engineer_zones disable row level security;
alter table public.reporter_ticket_followups disable row level security;

-- 3) Optional: if needed, recreate legacy policies from backup migration set.
-- See backup_migrations/202604*.sql and re-apply original policies table by table.

