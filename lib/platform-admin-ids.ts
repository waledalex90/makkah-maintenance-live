import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

/** Active platform admin user IDs (for excluding from tenant staff lists and counts). */
export async function getActivePlatformAdminUserIds(admin: AdminClient): Promise<string[]> {
  const { data, error } = await admin.from("platform_admins").select("user_id").eq("is_active", true);
  if (error || !data) return [];
  return data.map((r) => r.user_id as string);
}
