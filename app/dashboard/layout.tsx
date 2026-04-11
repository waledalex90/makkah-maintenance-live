import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DashboardSidebar } from "@/components/dashboard-sidebar";
import { FieldStaffPermissionsOnboarding } from "@/components/field-staff-permissions-onboarding";
import { LiveLocationTracker } from "@/components/live-location-tracker";
import { DashboardBottomNav } from "@/components/dashboard-bottom-nav";
import { PageTransition } from "@/components/page-transition";
import { DashboardTopbar } from "@/components/dashboard-topbar";
import { effectivePermissions } from "@/lib/permissions";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role, permissions, access_work_list")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    redirect("/login?notice=missing_profile");
  }

  if (profile.access_work_list || profile.role === "technician" || profile.role === "supervisor") {
    redirect("/tasks/my-work");
  }

  const fullName = profile.full_name ?? "User";
  const role = profile.role;
  const permissions = effectivePermissions(profile?.role, profile?.permissions as Record<string, unknown> | null);

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950">
      {role === "engineer" ? <FieldStaffPermissionsOnboarding role={role} /> : null}
      <LiveLocationTracker />
      <DashboardSidebar fullName={fullName} role={role} permissions={permissions} />
      <main className="flex-1 p-4 pb-24 md:p-6 md:pb-6">
        <DashboardTopbar fullName={fullName} />
        <PageTransition>{children}</PageTransition>
      </main>
      <DashboardBottomNav role={role} permissions={permissions} />
    </div>
  );
}
