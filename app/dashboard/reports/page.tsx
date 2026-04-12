import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { effectivePermissions } from "@/lib/permissions";
import { ReportsAnalyticsDashboard } from "@/components/reports-analytics-dashboard";

export default async function ReportsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, permissions")
    .eq("id", user.id)
    .single();

  const canReports = effectivePermissions(profile?.role, profile?.permissions as Record<string, unknown> | null).view_reports;
  if (!canReports) {
    redirect("/dashboard");
  }

  return <ReportsAnalyticsDashboard />;
}
