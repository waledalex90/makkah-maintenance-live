import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

export async function upsertProfileAndZones(
  adminSupabase: AdminClient,
  userId: string,
  params: {
    fullName: string;
    mobile: string;
    jobTitle: string;
    specialty: string;
    role: string | undefined;
    roleId?: string | null;
    zoneIds: string[];
    permissions: Record<string, unknown>;
    username: string;
    access_work_list?: boolean;
  },
) {
  const { fullName, mobile, jobTitle, specialty, role, roleId, zoneIds, permissions, username, access_work_list } = params;
  const row: Record<string, unknown> = {
    id: userId,
    full_name: fullName,
    mobile,
    job_title: jobTitle,
    specialty,
    role: role ?? "technician",
    role_id: roleId ?? null,
    permissions,
    username,
  };
  if (typeof access_work_list === "boolean") {
    row.access_work_list = access_work_list;
  }
  const { error: upsertError } = await adminSupabase.from("profiles").upsert(row, { onConflict: "id" });

  if (upsertError) {
    return upsertError;
  }

  const { error: deleteZonesError } = await adminSupabase.from("zone_profiles").delete().eq("profile_id", userId);
  if (deleteZonesError) {
    return deleteZonesError;
  }

  if (zoneIds.length > 0) {
    const { error: insertZonesError } = await adminSupabase.from("zone_profiles").insert(
      zoneIds.map((zoneId) => ({
        zone_id: zoneId,
        profile_id: userId,
      })),
    );
    if (insertZonesError) {
      return insertZonesError;
    }
  }

  return null;
}
