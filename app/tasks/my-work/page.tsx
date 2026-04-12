import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { FieldStaffPermissionsOnboarding } from "@/components/field-staff-permissions-onboarding";
import { TechnicianWorkList } from "@/components/technician-work-list";
import { LiveLocationTracker } from "@/components/live-location-tracker";
import { UserIdentityHeader } from "@/components/user-identity-header";

export default async function MyWorkPage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, access_work_list")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    redirect("/login?notice=missing_profile");
  }

  const allowedByRole =
    profile.role === "technician" ||
    profile.role === "supervisor" ||
    profile.role === "engineer";
  const allowed = Boolean(profile.access_work_list || allowedByRole);

  if (!allowed) {
    redirect("/dashboard");
  }

  const listRole: "technician" | "supervisor" | "engineer" =
    profile.role === "technician" || profile.role === "supervisor" || profile.role === "engineer"
      ? profile.role
      : "technician";

  return (
    <main className="min-h-screen bg-slate-50 p-3 sm:p-6">
      <FieldStaffPermissionsOnboarding role={profile.role} />
      <LiveLocationTracker />
      <div className="mx-auto max-w-md sm:max-w-4xl">
        <UserIdentityHeader />
        <TechnicianWorkList role={listRole} />
      </div>
    </main>
  );
}