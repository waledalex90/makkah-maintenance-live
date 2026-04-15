-- Phase 6.1: Overdue invoice state

alter table public.company_invoices
  drop constraint if exists company_invoices_invoice_status_check;

alter table public.company_invoices
  add constraint company_invoices_invoice_status_check
  check (invoice_status in ('draft', 'issued', 'overdue', 'paid', 'void'));
