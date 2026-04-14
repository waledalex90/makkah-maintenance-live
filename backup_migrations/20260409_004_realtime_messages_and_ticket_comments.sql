-- =========================================================
-- Migration: Realtime global messages and ticket comments
-- =========================================================

create table if not exists public.messages (
  id bigint generated always as identity primary key,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  message_text text not null check (length(trim(message_text)) > 0),
  sent_at timestamptz not null default now()
);

create table if not exists public.ticket_comments (
  id bigint generated always as identity primary key,
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  comment_text text not null check (length(trim(comment_text)) > 0),
  sent_at timestamptz not null default now()
);

create index if not exists idx_messages_sent_at on public.messages(sent_at);
create index if not exists idx_ticket_comments_ticket_id on public.ticket_comments(ticket_id);
create index if not exists idx_ticket_comments_sent_at on public.ticket_comments(sent_at);

alter table public.messages enable row level security;
alter table public.messages force row level security;
alter table public.ticket_comments enable row level security;
alter table public.ticket_comments force row level security;

drop policy if exists "messages_select_policy" on public.messages;
create policy "messages_select_policy"
on public.messages
for select
to authenticated
using (true);

drop policy if exists "messages_insert_policy" on public.messages;
create policy "messages_insert_policy"
on public.messages
for insert
to authenticated
with check (sender_id = auth.uid());

drop policy if exists "messages_update_policy" on public.messages;
create policy "messages_update_policy"
on public.messages
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "messages_delete_policy" on public.messages;
create policy "messages_delete_policy"
on public.messages
for delete
to authenticated
using (public.is_admin());

drop policy if exists "ticket_comments_select_policy" on public.ticket_comments;
create policy "ticket_comments_select_policy"
on public.ticket_comments
for select
to authenticated
using (public.can_access_ticket(ticket_id));

drop policy if exists "ticket_comments_insert_policy" on public.ticket_comments;
create policy "ticket_comments_insert_policy"
on public.ticket_comments
for insert
to authenticated
with check (
  public.can_access_ticket(ticket_id)
  and sender_id = auth.uid()
);

drop policy if exists "ticket_comments_update_policy" on public.ticket_comments;
create policy "ticket_comments_update_policy"
on public.ticket_comments
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "ticket_comments_delete_policy" on public.ticket_comments;
create policy "ticket_comments_delete_policy"
on public.ticket_comments
for delete
to authenticated
using (public.is_admin());

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'ticket_comments'
  ) then
    alter publication supabase_realtime add table public.ticket_comments;
  end if;
end $$;

