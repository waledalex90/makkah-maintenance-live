-- تتبع مهام مسؤولي البلاغات: من يتابع (جاري العمل) وإخفاء المهمة بعد الإنجاز (تم)

create table if not exists public.reporter_ticket_followups (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  is_working boolean not null default false,
  dismissed_at timestamptz null,
  updated_at timestamptz not null default now(),
  unique (ticket_id, user_id)
);

create index if not exists idx_reporter_followups_ticket on public.reporter_ticket_followups(ticket_id);
create index if not exists idx_reporter_followups_user on public.reporter_ticket_followups(user_id);

drop trigger if exists trg_reporter_followups_updated_at on public.reporter_ticket_followups;
create trigger trg_reporter_followups_updated_at
before update on public.reporter_ticket_followups
for each row execute function public.set_updated_at();

alter table public.reporter_ticket_followups enable row level security;

drop policy if exists "reporter_followups_select" on public.reporter_ticket_followups;
create policy "reporter_followups_select"
  on public.reporter_ticket_followups for select
  to authenticated
  using (true);

drop policy if exists "reporter_followups_insert_own" on public.reporter_ticket_followups;
create policy "reporter_followups_insert_own"
  on public.reporter_ticket_followups for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "reporter_followups_update_own" on public.reporter_ticket_followups;
create policy "reporter_followups_update_own"
  on public.reporter_ticket_followups for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "reporter_followups_delete_own" on public.reporter_ticket_followups;
create policy "reporter_followups_delete_own"
  on public.reporter_ticket_followups for delete
  to authenticated
  using (user_id = auth.uid());

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reporter_ticket_followups'
  ) then
    alter publication supabase_realtime add table public.reporter_ticket_followups;
  end if;
end $$;
