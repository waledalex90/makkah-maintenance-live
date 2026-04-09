import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TicketsWorkspaceContent } from "@/components/tickets-workspace-content";

export default async function DashboardTicketsPage() {
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

  return <TicketsWorkspaceContent role={profile?.role ?? "reporter"} />;
}