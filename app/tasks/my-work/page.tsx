import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TechnicianWorkList } from "@/components/technician-work-list";
import { LiveLocationTracker } from "@/components/live-location-tracker";

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
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "technician" && profile?.role !== "supervisor") {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen bg-slate-100 p-3 sm:p-6">
      <LiveLocationTracker />
      <div className="mx-auto max-w-md sm:max-w-4xl">
        <TechnicianWorkList role={profile.role as "technician" | "supervisor"} />
      </div>
    </main>
  );
}