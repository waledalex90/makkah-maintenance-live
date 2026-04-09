-- =========================================================
-- Migration: Add ticket priority and map coordinates
-- =========================================================

alter table public.tickets
  add column if not exists priority text not null default 'medium',
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tickets_priority_check'
  ) then
    alter table public.tickets
      add constraint tickets_priority_check
      check (priority in ('low', 'medium', 'high'));
  end if;
end $$;

