import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminDashboardContent } from "@/components/admin-dashboard-content";

export default async function DashboardHomePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role === "technician") {
    redirect("/tasks/my-work");
  }

  if (profile?.role === "reporter") {
    redirect("/dashboard/tickets");
  }

  return <AdminDashboardContent role={profile?.role ?? "engineer"} />;
}
