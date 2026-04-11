-- مزامنة ملف المدير لحسابات Auth المعروفة (كلمة المرور تُضبط من لوحة Supabase Authentication فقط)
-- يُنفَّذ بعد وجود المستخدم في auth.users بأحد البريدين أدناه.

insert into public.profiles (id, full_name, mobile, role, username, permissions)
select
  a.id,
  'Walid Admin',
  'N/A',
  'admin'::public.app_role,
  'walid_admin',
  jsonb_build_object(
    'view_dashboard', true,
    'view_tickets', true,
    'view_map', true,
    'view_reports', true,
    'manage_zones', true,
    'manage_users', true,
    'view_settings', true
  )
from auth.users a
where lower(trim(a.email)) in ('waledalex90@gmail.com', 'walid_admin@makkah.sys')
on conflict (id) do update set
  username = excluded.username,
  role = excluded.role,
  permissions = excluded.permissions,
  updated_at = now();
