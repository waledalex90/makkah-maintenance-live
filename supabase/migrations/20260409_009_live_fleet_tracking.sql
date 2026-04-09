-- =========================================================
-- Migration: Live fleet tracking support columns
-- =========================================================

alter table public.profiles
  add column if not exists current_latitude double precision,
  add column if not exists current_longitude double precision,
  add column if not exists last_location_at timestamptz,
  add column if not exists availability_status text not null default 'available';

create index if not exists idx_profiles_last_location_at on public.profiles(last_location_at);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_availability_status_check'
  ) then
    alter table public.profiles
      add constraint profiles_availability_status_check
      check (availability_status in ('available', 'busy', 'offline'));
  end if;
end $$;
