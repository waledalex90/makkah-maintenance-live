-- إنشاء جدول global_settings إن لم يكن موجوداً (مثلاً إذا لم تُطبَّق الهجرات السابقة).
-- القيم تُخزَّن كنص (JSON يمكن تخزينه كنص؛ العمود type يصف نوع القيمة للواجهة).

create table if not exists public.global_settings (
  key text primary key,
  value text not null,
  description text,
  type text not null default 'string' check (type in ('string', 'number', 'boolean', 'json')),
  category text not null default 'general',
  updated_at timestamptz not null default now()
);

comment on table public.global_settings is 'إعدادات افتراضية على مستوى المنصة؛ القيم نصية للتوافق مع واجهات التطبيق.';
comment on column public.global_settings.value is 'قيمة الإعداد كنص؛ يمكن تخزين JSON كنص عند type=json.';

-- فهرس اختياري للتصفية حسب التصنيف
create index if not exists idx_global_settings_category on public.global_settings (category);

-- تحديث updated_at (دالة محلية حتى تعمل الهجرة دون الاعتماد على هجرات أخرى)
create or replace function public.set_global_settings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_global_settings_updated_at on public.global_settings;
create trigger trg_global_settings_updated_at
before update on public.global_settings
for each row execute function public.set_global_settings_updated_at();

alter table public.global_settings enable row level security;

drop policy if exists "global_settings_select_authenticated" on public.global_settings;
create policy "global_settings_select_authenticated"
  on public.global_settings for select
  to authenticated
  using (true);

drop policy if exists "global_settings_write_platform_admin" on public.global_settings;
create policy "global_settings_write_platform_admin"
  on public.global_settings for all
  to authenticated
  using (
    exists (
      select 1 from public.platform_admins p
      where p.user_id = auth.uid() and p.is_active = true
    )
  )
  with check (
    exists (
      select 1 from public.platform_admins p
      where p.user_id = auth.uid() and p.is_active = true
    )
  );

-- صلاحيات الجدول لأدوار Supabase (مع RLS)
grant usage on schema public to postgres, anon, authenticated, service_role;

grant select, insert, update, delete on table public.global_settings to authenticated;
grant all on table public.global_settings to service_role;
grant all on table public.global_settings to postgres;

-- بذور افتراضية (لا تُستبدل القيم إن وُجدت)
insert into public.global_settings (key, value, description, type, category) values
  (
    'pickup_threshold_minutes',
    '2',
    'الحد الزمني بالدقائق قبل اعتبار بلاغ «لم يُستلم» متأخراً في الاستلام.',
    'number',
    'ticketing'
  ),
  (
    'warning_percentage',
    '0.75',
    'نسبة من مهلة الاستلام تُستخدم لعرض حالة «أوشك على التأخير» (مثلاً 0.75 = 75%).',
    'number',
    'ticketing'
  ),
  (
    'enable_sound_alerts',
    'true',
    'تشغيل تنبيه صوتي عند ظهور تنبيهات المراقبة في غرفة العمليات.',
    'boolean',
    'ticketing'
  )
on conflict (key) do nothing;
