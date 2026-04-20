-- تشغيل يدوي من SQL Editor (بدون التطبيق):
-- 1) استبدل USER_UUID بمعرف مدير المنصة النشط من public.platform_admins أو auth.users
-- 2) نفّذ السطر الأخير فقط.
--
-- يحذف كل الشركات ما عدا شركة الصدفة (__platform-shell__) وجميع البيانات التشغيلية المرتبطة،
-- وفق دالة platform_purge_tenant_data المعرّفة في الهجرات.

-- select id, email from auth.users limit 20;
-- select user_id from public.platform_admins where is_active = true;

select public.platform_purge_tenant_data('USER_UUID_HERE'::uuid);
