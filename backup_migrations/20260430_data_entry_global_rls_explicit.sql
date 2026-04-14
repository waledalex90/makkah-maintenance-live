-- ضمان صريح لمدخل بيانات العمليات: SELECT على كل tickets وكل profiles
-- يستخدم current_user_role() (SECURITY DEFINER) فلا يُعيد استعلام profiles ضمن شرط RLS على profiles.
-- يُدمج مع السياسات الحالية (permissive OR) ولا يحل محل tickets_select_policy العامة.

drop policy if exists "tickets_select_data_entry_global" on public.tickets;

create policy "tickets_select_data_entry_global"
on public.tickets
for select
to authenticated
using (public.current_user_role()::text = 'data_entry');

drop policy if exists "profiles_select_data_entry_global" on public.profiles;

create policy "profiles_select_data_entry_global"
on public.profiles
for select
to authenticated
using (public.current_user_role()::text = 'data_entry');
