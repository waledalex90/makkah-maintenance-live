-- =========================================================
-- Migration: profiles profession + specialty fields
-- =========================================================

alter table public.profiles
  add column if not exists job_title text,
  add column if not exists specialty text;

alter table public.profiles
  drop constraint if exists profiles_specialty_check;

alter table public.profiles
  add constraint profiles_specialty_check
  check (
    specialty is null
    or specialty in ('fire', 'electricity', 'ac', 'civil', 'kitchens')
  );
