-- سياسة SELECT إضافية (تراكمية مع tickets_select_policy): أدمن/مدير مشاريع/مدير مشاريع/مدخل بيانات + بريد سوبر أدمن
-- سياسات permissive تُقيَّم بـ OR؛ باقي الأدوار ما زالت تعتمد على can_access_ticket في tickets_select_policy.

drop policy if exists "allow_data_entry_and_admins_to_view_all" on public.tickets;

drop policy if exists "can_access_ticket" on public.tickets;
drop policy if exists "data_entry_access_policy" on public.tickets;

create policy "allow_data_entry_and_admins_to_view_all"
on public.tickets
for select
to authenticated
using (
  (auth.jwt() ->> 'email') = 'waledalex90@gmail.com'
  or (
    select p.role::text
    from public.profiles p
    where p.id = auth.uid()
  ) in ('admin', 'project_manager', 'projects_director', 'data_entry')
);
