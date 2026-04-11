import { createSupabaseServerClient } from "@/lib/supabase/server";
import { effectivePermissions } from "@/lib/permissions";

type ProfileRow = {
  role: string;
  permissions?: Record<string, unknown> | null;
};

export async function getSessionProfile() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return { user: null as null, profile: null as ProfileRow | null, supabase };
  }
  const { data: profile } = await supabase.from("profiles").select("role, permissions").eq("id", user.id).single();
  return { user, profile: profile as ProfileRow | null, supabase };
}

export function hasManageUsers(profile: ProfileRow | null): boolean {
  if (!profile) return false;
  if (profile.role === "admin") return true;
  return effectivePermissions(profile.role, profile.permissions ?? undefined).manage_users;
}

export function hasManageZones(profile: ProfileRow | null): boolean {
  if (!profile) return false;
  if (profile.role === "admin") return true;
  return effectivePermissions(profile.role, profile.permissions ?? undefined).manage_zones;
}

/** للاستخدام في API routes (إدارة المستخدمين والدعوات وكلمات المرور). */
export async function requireManageUsers(): Promise<{ ok: true } | { ok: false; status: number }> {
  const { user, profile } = await getSessionProfile();
  if (!user) return { ok: false, status: 401 };
  if (!hasManageUsers(profile)) return { ok: false, status: 403 };
  return { ok: true };
}

/** إدارة المناطق (صفحة المناطق + واجهاتها إن وُجدت). */
export async function requireManageZones(): Promise<{ ok: true } | { ok: false; status: number }> {
  const { user, profile } = await getSessionProfile();
  if (!user) return { ok: false, status: 401 };
  if (!hasManageZones(profile)) return { ok: false, status: 403 };
  return { ok: true };
}
