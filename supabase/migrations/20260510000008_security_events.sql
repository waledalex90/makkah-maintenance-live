-- Phase 4: Security monitoring events for tenant guards and auth rejects

create table if not exists public.security_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  status_code int null,
  message text not null,
  actor_user_id uuid null,
  actor_email text null,
  actor_company_id uuid null references public.companies(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_security_events_created_at
  on public.security_events(created_at desc);

create index if not exists idx_security_events_type_created
  on public.security_events(event_type, created_at desc);

create index if not exists idx_security_events_status_created
  on public.security_events(status_code, created_at desc);

