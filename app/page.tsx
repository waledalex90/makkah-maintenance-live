import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function HomePage() {
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

  if (profile.access_work_list) {
    redirect("/tasks/my-work");
  }

  if (profile.role === "technician" || profile.role === "supervisor" || profile.role === "data_entry") {
    redirect("/tasks/my-work");
  }

  if (profile.role === "reporter" || profile.role === "engineer") {
    redirect("/dashboard/tickets");
  }

  redirect("/dashboard");
}