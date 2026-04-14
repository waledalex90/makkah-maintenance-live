import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { OfficialReporterTasksContent } from "@/components/official-reporter-tasks-content";
import { effectivePermissions } from "@/lib/permissions";

type ProfilePermRow = {
  role?: string | null;
  permissions?: Record<string, unknown> | null;
  roles?: { permissions?: Record<string, unknown> | null } | { permissions?: Record<string, unknown> | null }[] | null;
};

export default async function DashboardTasksPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, permissions, roles:role_id(permissions)")
    .eq("id", user.id)
    .single();
  const typedProfile = (profile ?? null) as ProfilePermRow | null;
  const rolePerms = Array.isArray(typedProfile?.roles)
    ? typedProfile.roles[0]?.permissions
    : typedProfile?.roles?.permissions;
  const perms = effectivePermissions(typedProfile?.role, {
    ...(rolePerms ?? {}),
    ...((typedProfile?.permissions as Record<string, unknown>) ?? {}),
  });
  if (!perms.view_tickets) {
    redirect("/dashboard");
  }

  return <OfficialReporterTasksContent />;
}
