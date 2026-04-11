-- Allow operations roles to read fleet positions (map) — excludes filtering client-side for admin pins
drop policy if exists "live_locations_select_policy" on public.live_locations;
create policy "live_locations_select_policy"
on public.live_locations
for select
to authenticated
using (
  public.is_admin()
  or public.current_user_role()::text in (
    'project_manager',
    'projects_director',
    'engineer',
    'supervisor',
    'technician',
    'reporter'
  )
  or user_id = auth.uid()
  or (
    public.current_user_role() = 'supervisor'::public.app_role
    and exists (
      select 1
      from public.profiles p
      where p.id = user_id
        and p.supervisor_id = auth.uid()
    )
  )
);

drop policy if exists "profiles_select_policy" on public.profiles;
create policy "profiles_select_policy"
on public.profiles
for select
to authenticated
using (
  public.is_admin()
  or id = auth.uid()
  or (
    public.current_user_role() = 'supervisor'::public.app_role
    and supervisor_id = auth.uid()
  )
  or public.current_user_role()::text in (
    'project_manager',
    'projects_director',
    'engineer',
    'supervisor',
    'technician',
    'reporter'
  )
);
