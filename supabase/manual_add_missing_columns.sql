-- تشغيل يدوي في SQL Editor عندما تريد التأكد من وجود الأعمدة (آمن للتكرار).
-- للمنطق الكامل (RLS + المرفقات + مزامنة التصنيف) طبّق أيضاً migration:
-- supabase/migrations/20260411_area_tasks_rls_and_attachments.sql

alter table public.profiles
  add column if not exists region text;

alter table public.tickets
  add column if not exists category text;

alter table public.ticket_attachments
  add column if not exists file_name text,
  add column if not exists sort_order integer not null default 0;

-- specialty موجود مسبقاً في migration 20260410_010_profiles_profession_specialty.sql
-- category_id + ticket_categories موجودان منذ 20260409_006_professional_ticketing_upgrade.sql
