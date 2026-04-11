import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DashboardSidebar } from "@/components/dashboard-sidebar";
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
    .select("full_name, role, permissions")
    .eq("id", user.id)
    .single();

  if (profile?.role === "technician" || profile?.role === "supervisor") {
    redirect("/tasks/my-work");
  }

  const fullName = profile?.full_name ?? "User";
  const role = profile?.role ?? "engineer";
  const permissions = effectivePermissions(profile?.role, profile?.permissions as Record<string, unknown> | null);

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950">
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
