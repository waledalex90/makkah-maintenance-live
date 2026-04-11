import { redirect } from "next/navigation";
import { OperationsMapLoader } from "@/components/operations-map-loader";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { effectivePermissions } from "@/lib/permissions";

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
    .select("role, permissions")
    .eq("id", user.id)
    .single();

  const perms = effectivePermissions(profile?.role, profile?.permissions as Record<string, unknown> | null);
  if (!perms.view_map) {
    redirect("/dashboard");
  }

  return <OperationsMapLoader />;
}