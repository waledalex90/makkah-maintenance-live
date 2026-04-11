import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ZonesManagementContent } from "@/components/zones-management-content";
import { effectivePermissions } from "@/lib/permissions";

export default async function AdminZonesPage() {
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

  if (profile?.role === "technician" || profile?.role === "supervisor") {
    redirect("/tasks/my-work");
  }
  if (profile?.role === "reporter") {
    redirect("/dashboard/tickets");
  }

  const perms = effectivePermissions(profile?.role, profile?.permissions as Record<string, unknown> | null);
  if (!perms.manage_zones) {
    redirect("/dashboard");
  }

  return <ZonesManagementContent />;
}
