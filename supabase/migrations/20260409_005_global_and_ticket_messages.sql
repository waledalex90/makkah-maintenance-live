-- =========================================================
-- Migration: Global/ticket messages for realtime ops room
-- =========================================================

create table if not exists public.global_messages (
  id bigint generated always as identity primary key,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (length(trim(content)) > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.ticket_messages (
  id bigint generated always as identity primary key,
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (length(trim(content)) > 0),
  image_url text null,
  created_at timestamptz not null default now()
);

create index if not exists idx_global_messages_created_at on public.global_messages(created_at);
create index if not exists idx_ticket_messages_ticket_id on public.ticket_messages(ticket_id);
create index if not exists idx_ticket_messages_created_at on public.ticket_messages(created_at);

alter table public.global_messages enable row level security;
alter table public.global_messages force row level security;
alter table public.ticket_messages enable row level security;
alter table public.ticket_messages force row level security;

drop policy if exists "global_messages_select_policy" on public.global_messages;
create policy "global_messages_select_policy"
on public.global_messages
for select
to authenticated
using (true);

drop policy if exists "global_messages_insert_policy" on public.global_messages;
create policy "global_messages_insert_policy"
on public.global_messages
for insert
to authenticated
with check (sender_id = auth.uid());

drop policy if exists "global_messages_update_policy" on public.global_messages;
create policy "global_messages_update_policy"
on public.global_messages
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "global_messages_delete_policy" on public.global_messages;
create policy "global_messages_delete_policy"
on public.global_messages
for delete
to authenticated
using (public.is_admin());

drop policy if exists "ticket_messages_select_policy" on public.ticket_messages;
create policy "ticket_messages_select_policy"
on public.ticket_messages
for select
to authenticated
using (public.can_access_ticket(ticket_id));

drop policy if exists "ticket_messages_insert_policy" on public.ticket_messages;
create policy "ticket_messages_insert_policy"
on public.ticket_messages
for insert
to authenticated
with check (
  public.can_access_ticket(ticket_id)
  and sender_id = auth.uid()
);

drop policy if exists "ticket_messages_update_policy" on public.ticket_messages;
create policy "ticket_messages_update_policy"
on public.ticket_messages
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "ticket_messages_delete_policy" on public.ticket_messages;
create policy "ticket_messages_delete_policy"
on public.ticket_messages
for delete
to authenticated
using (public.is_admin());

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'global_messages'
  ) then
    alter publication supabase_realtime add table public.global_messages;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'ticket_messages'
  ) then
    alter publication supabase_realtime add table public.ticket_messages;
  end if;
end $$;

