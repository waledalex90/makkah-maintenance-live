-- Hierarchical settings: global defaults + per-company overrides

create table if not exists public.global_settings (
  key text primary key,
  value text not null,
  description text,
  type text not null default 'string' check (type in ('string', 'number', 'boolean', 'json')),
  category text not null default 'general',
  updated_at timestamptz not null default now()
);

create table if not exists public.company_settings (
  company_id uuid not null references public.companies(id) on delete cascade,
  key text not null,
  value text not null,
  updated_at timestamptz not null default now(),
  primary key (company_id, key)
);

create index if not exists idx_company_settings_company on public.company_settings(company_id);

drop trigger if exists trg_global_settings_updated_at on public.global_settings;
create trigger trg_global_settings_updated_at
before update on public.global_settings
for each row execute function public.touch_updated_at_generic();

drop trigger if exists trg_company_settings_updated_at on public.company_settings;
create trigger trg_company_settings_updated_at
before update on public.company_settings
for each row execute function public.touch_updated_at_generic();

alter table public.global_settings enable row level security;
alter table public.company_settings enable row level security;

-- قراءة الإعدادات العامة لأي مستخدم مسجّل
drop policy if exists "global_settings_select_authenticated" on public.global_settings;
create policy "global_settings_select_authenticated"
  on public.global_settings for select
  to authenticated
  using (true);

-- تعديل الإعدادات العامة: مديرو المنصة فقط
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

-- إعدادات الشركة: قراءة لأعضاء الشركة أو مديري المنصة
drop policy if exists "company_settings_select" on public.company_settings;
create policy "company_settings_select"
  on public.company_settings for select
  to authenticated
  using (
    exists (select 1 from public.platform_admins p where p.user_id = auth.uid() and p.is_active = true)
    or exists (
      select 1 from public.company_memberships m
      where m.company_id = company_settings.company_id
        and m.user_id = auth.uid()
        and m.status = 'active'
    )
  );

drop policy if exists "company_settings_write_platform_admin" on public.company_settings;
create policy "company_settings_write_platform_admin"
  on public.company_settings for all
  to authenticated
  using (
    exists (select 1 from public.platform_admins p where p.user_id = auth.uid() and p.is_active = true)
  )
  with check (
    exists (select 1 from public.platform_admins p where p.user_id = auth.uid() and p.is_active = true)
  );

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
