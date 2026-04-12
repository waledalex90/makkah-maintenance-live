import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { OfficialReporterTasksContent } from "@/components/official-reporter-tasks-content";

export default async function DashboardTasksPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();

  if (profile?.role !== "reporter" && profile?.role !== "admin") {
    redirect("/dashboard");
  }

  return <OfficialReporterTasksContent />;
}
