-- بوابة الدخول: ضمان SELECT على صف المستخدم الحالي حتى لو تُركت سياسة أخرى ضعيفة أو حُذفت بالخطأ.
-- (صفحة /login و middleware يقرآن profiles بـ .eq("id", user.id).)
--
-- ملاحظة: سياسات tickets التي تستخدم (select role from profiles where id = auth.uid())
-- لا تتطلب عمود email في profiles؛ البريد في RLS يأتي من auth.jwt() وليس من جدول profiles.

drop policy if exists "profiles_select_own_row_always" on public.profiles;

create policy "profiles_select_own_row_always"
on public.profiles
for select
to authenticated
using (id = auth.uid());

-- إعادة profiles_select_policy كما في 20260413 مع إضافة data_entry لقراءة زملاء العمليات (مثل باقي الأدوار الميدانية)
drop policy if exists "profiles_select_policy" on public.profiles;

create policy "profiles_select_policy"
on public.profiles
for select
to authenticated
using (
  public.is_admin()
  or id = auth.uid()
  or (
    public.current_user_role() = 'supervisor'::public.app_role
    and supervisor_id = auth.uid()
  )
  or public.current_user_role()::text in (
    'project_manager',
    'projects_director',
    'engineer',
    'supervisor',
    'technician',
    'reporter',
    'data_entry'
  )
);

-- توحيد خريطة الأسطول مع نفس الدور (اختياري لكن يمنع مفاجآت عند فتح الخريطة)
drop policy if exists "live_locations_select_policy" on public.live_locations;

create policy "live_locations_select_policy"
on public.live_locations
for select
to authenticated
using (
  public.is_admin()
  or public.current_user_role()::text in (
    'project_manager',
    'projects_director',
    'engineer',
    'supervisor',
    'technician',
    'reporter',
    'data_entry'
  )
  or user_id = auth.uid()
  or (
    public.current_user_role() = 'supervisor'::public.app_role
    and exists (
      select 1
      from public.profiles p
      where p.id = user_id
        and p.supervisor_id = auth.uid()
    )
  )
);
