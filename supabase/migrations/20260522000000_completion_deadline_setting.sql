-- مهلة الإنجاز الافتراضية (منذ الاستلام) لمسار «تم الاستلام» في غرفة العمليات
insert into public.global_settings (key, value, description, type, category) values
  (
    'completion_deadline_minutes',
    '40',
    'المهلة بالدقائق منذ استلام البلاغ لاعتبار التنفيذ متأخراً (مسار الإنجاز).',
    'number',
    'ticketing'
  )
on conflict (key) do nothing;
