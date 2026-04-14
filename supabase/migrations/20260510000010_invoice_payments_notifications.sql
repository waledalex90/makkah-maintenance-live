-- Phase 5.5: Invoice payment flow and manager notifications

alter table public.companies
  add column if not exists subscription_status text not null default 'active'
  check (subscription_status in ('active', 'past_due', 'expired', 'trial', 'cancelled')),
  add column if not exists subscription_expires_at timestamptz null,
  add column if not exists billing_email text null;

alter table public.company_invoices
  add column if not exists invoice_number text null,
  add column if not exists stripe_checkout_session_id text null,
  add column if not exists stripe_payment_intent_id text null,
  add column if not exists paid_amount numeric(12,2) null,
  add column if not exists paid_currency text null;

create unique index if not exists uq_company_invoices_invoice_number
  on public.company_invoices(invoice_number)
  where invoice_number is not null;

create table if not exists public.company_notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid null references public.profiles(id) on delete cascade,
  notification_type text not null,
  title text not null,
  body text not null,
  metadata jsonb not null default '{}'::jsonb,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_company_notifications_company_created
  on public.company_notifications(company_id, created_at desc);
create index if not exists idx_company_notifications_user_read
  on public.company_notifications(user_id, is_read, created_at desc);

