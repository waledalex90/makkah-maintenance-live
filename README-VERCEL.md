# دليل سريع للنشر على Vercel (للمدير وليد)

هذا الدليل يربط المشروع بـ Vercel بسرعة وبأقل إعدادات.

## 1) تجهيز المستودع

- تأكد أن المشروع مرفوع على GitHub.
- تأكد أن الفرع الرئيسي يحتوي آخر نسخة مستقرة.

## 2) ربط المشروع بضغطة واحدة

- افتح [Vercel New Project](https://vercel.com/new).
- اختر مستودع المشروع من GitHub.
- اضغط `Import` ثم `Deploy`.

## 3) متغيرات البيئة المطلوبة

أضف هذه المتغيرات داخل Vercel (Project Settings > Environment Variables):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL` = رابط المشروع بعد النشر (مثال: `https://your-app.vercel.app`)

> مهم: بعد أول نشر، ارجع وعدّل `NEXT_PUBLIC_APP_URL` إلى رابط Vercel النهائي ثم أعد النشر.

## 4) إعداد Supabase للدعوات وتسجيل الدخول

داخل Supabase:

- Authentication > URL Configuration
- أضف رابط الموقع المنشور في:
  - `Site URL`
  - `Redirect URLs` (مثال: `https://your-app.vercel.app/login`)

## 5) تفعيل SQL Migrations

شغّل آخر migrations في Supabase SQL Editor بنفس الترتيب داخل مجلد:

- `supabase/migrations`

## 6) اختبار سريع بعد النشر

- افتح الموقع من الجوال والمتصفح.
- جرّب تثبيت التطبيق (PWA) من المتصفح.
- جرّب إنشاء مستخدم جديد وتأكد أن بريد التفعيل وصل.
- جرّب GPS من رابط HTTPS وتأكد أن الإذن يعمل.

## 7) تحديثات لاحقة

- أي Push جديد على الفرع الرئيسي ينشر تلقائياً على Vercel.
