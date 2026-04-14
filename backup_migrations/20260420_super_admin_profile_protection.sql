-- حماية سجل المدير المحمي (waledalex90@gmail.com) من التعديل عبر JWT لمستخدم آخر

create or replace function public.enforce_super_admin_profile_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  protected_email constant text := 'waledalex90@gmail.com';
  em text;
begin
  select u.email into em from auth.users u where u.id = old.id;
  if em is null or lower(trim(em)) <> lower(trim(protected_email)) then
    return new;
  end if;
  if auth.uid() is not null and auth.uid() = old.id then
    return new;
  end if;
  if auth.uid() is not null and auth.uid() is distinct from old.id then
    raise exception 'forbidden_super_admin_profile'
      using errcode = 'P0001',
            message = 'لا يُسمح بتعديل حساب المدير المحمي إلا من صاحبه.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_super_admin_profile_upd on public.profiles;
create trigger trg_protect_super_admin_profile_upd
before update on public.profiles
for each row execute function public.enforce_super_admin_profile_update();

create or replace function public.enforce_super_admin_profile_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  protected_email constant text := 'waledalex90@gmail.com';
  em text;
begin
  select u.email into em from auth.users u where u.id = old.id;
  if em is not null and lower(trim(em)) = lower(trim(protected_email)) then
    raise exception 'forbidden_super_admin_delete'
      using errcode = 'P0001',
            message = 'لا يمكن حذف حساب المدير المحمي.';
  end if;
  return old;
end;
$$;

drop trigger if exists trg_protect_super_admin_profile_del on public.profiles;
create trigger trg_protect_super_admin_profile_del
before delete on public.profiles
for each row execute function public.enforce_super_admin_profile_delete();
