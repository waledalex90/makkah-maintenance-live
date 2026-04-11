import { redirect } from "next/navigation";
import { OperationsMapLoader } from "@/components/operations-map-loader";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function DashboardMapPage() {
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

  if (profile?.role === "reporter") {
    redirect("/dashboard/tickets");
  }

  return <OperationsMapLoader />;
}