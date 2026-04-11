-- واجهة الفريق: عند التفعيل يُوجَّه المستخدم إلى مهام الميدان (/tasks/my-work)
alter table public.profiles
  add column if not exists access_work_list boolean not null default false;

comment on column public.profiles.access_work_list is 'When true, user lands on field work list UI (tasks/my-work) after login.';
