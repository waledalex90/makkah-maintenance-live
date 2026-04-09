import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DashboardSidebar } from "@/components/dashboard-sidebar";
import { ZoneNotificationsListener } from "@/components/zone-notifications-listener";

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
    .select("full_name, role")
    .eq("id", user.id)
    .single();

  if (profile?.role === "technician") {
    redirect("/tasks/my-work");
  }

  const fullName = profile?.full_name ?? "User";
  const role = profile?.role ?? "engineer";

  return (
    <div className="flex min-h-screen bg-slate-100">
      <ZoneNotificationsListener />
      <DashboardSidebar fullName={fullName} role={role} />
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}