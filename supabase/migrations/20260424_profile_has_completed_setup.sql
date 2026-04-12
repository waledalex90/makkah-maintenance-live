-- إكمال معالج إعداد الميدان (صلاحيات الموقع والإشعارات) — مرة واحدة لكل مستخدم

alter table public.profiles add column if not exists has_completed_setup boolean not null default false;

comment on column public.profiles.has_completed_setup is 'true بعد إكمال معالج الإلزام لصلاحيات الميدان (الواجهة)';
