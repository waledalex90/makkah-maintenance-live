import { createSupabaseServerClient } from "@/lib/supabase/server";
import { effectivePermissions } from "@/lib/permissions";
import { getTenantContext } from "@/lib/tenant-context";

type ProfileRow = {
  role: string;
  role_id?: string | null;
  permissions?: Record<string, unknown> | null;
  roles?: { permissions?: Record<string, unknown> | null } | { permissions?: Record<string, unknown> | null }[] | null;
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
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, role_id, permissions, roles:role_id(permissions)")
    .eq("id", user.id)
    .single();
  return { user, profile: profile as ProfileRow | null, supabase };
}

export function hasManageUsers(profile: ProfileRow | null): boolean {
  if (!profile) return false;
  const rolePerms = Array.isArray(profile.roles) ? profile.roles[0]?.permissions : profile.roles?.permissions;
  const merged = { ...(rolePerms ?? {}), ...(profile.permissions ?? {}) };
  const allowed = effectivePermissions(profile.role, merged).manage_users;
  console.info("[rbac-authz]", {
    check: "manage_users",
    role: profile.role,
    role_id: profile.role_id ?? null,
    decision: allowed ? "allow" : "deny",
  });
  return allowed;
}

export function hasManageZones(profile: ProfileRow | null): boolean {
  if (!profile) return false;
  const rolePerms = Array.isArray(profile.roles) ? profile.roles[0]?.permissions : profile.roles?.permissions;
  const merged = { ...(rolePerms ?? {}), ...(profile.permissions ?? {}) };
  const allowed = effectivePermissions(profile.role, merged).manage_zones;
  console.info("[rbac-authz]", {
    check: "manage_zones",
    role: profile.role,
    role_id: profile.role_id ?? null,
    decision: allowed ? "allow" : "deny",
  });
  return allowed;
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

/** حارس إدارة المنصة (Platform Admin) لمسارات التحكم العامة فقط. */
export async function requirePlatformAdmin(): Promise<{ ok: true } | { ok: false; status: number }> {
  const tenant = await getTenantContext();
  if (!tenant.ok) return { ok: false, status: tenant.status };
  if (!tenant.isPlatformAdmin) return { ok: false, status: 403 };
  return { ok: true };
}
