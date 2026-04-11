import { Suspense } from "react";
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
    .maybeSingle();

  if (!profile) {
    redirect("/login?notice=missing_profile");
  }

  if (profile.role === "technician" || profile.role === "supervisor") {
    redirect("/tasks/my-work");
  }

  if (profile.role === "reporter" || profile.role === "engineer") {
    redirect("/dashboard/tickets");
  }

  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-slate-500">جاري تحميل لوحة التحكم…</div>}>
      <AdminDashboardContent role={profile.role} />
    </Suspense>
  );
}
