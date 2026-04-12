-- رؤية SELECT موسّعة لأدوار الإدارة + مدخل بيانات + مُبلغ (انظر التحذير في أسفل الملف)
-- تحذير: تضمين reporter هنا يعني أن كل مستخدم role=reporter يرى كل البلاغات في النظام،
-- وليس بلاغاته فقط. الأفضل لموظفي المكتب: role = data_entry في profiles بدل reporter.

drop policy if exists "final_global_access_policy" on public.tickets;

drop policy if exists "super_access_policy" on public.tickets;

create policy "final_global_access_policy"
on public.tickets
for select
to authenticated
using (
  (
    select p.role::text
    from public.profiles p
    where p.id = auth.uid()
  ) in ('admin', 'project_manager', 'projects_director', 'data_entry', 'reporter')
  or (auth.jwt() ->> 'email') = 'waledalex90@gmail.com'
);
