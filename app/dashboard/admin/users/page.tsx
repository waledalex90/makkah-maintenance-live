import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { UsersManagementContent } from "@/components/users-management-content";
import { effectivePermissions } from "@/lib/permissions";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
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
  if (!perms.manage_users) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const initialView = params?.view === "roles" ? "roles" : "users";

  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-slate-500">جاري التحميل…</div>}>
      <UsersManagementContent initialView={initialView} />
    </Suspense>
  );
}
