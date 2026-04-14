import { NextResponse } from "next/server";
import { requireManageUsers } from "@/lib/auth-guards";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isDynamicRolesEnabled } from "@/lib/feature-flags";
import {
  isLegacySystemRole,
  isValidRoleKey,
  normalizeDisplayName,
  normalizeRoleKey,
  roleToPublicOption,
  sanitizePermissionPayload,
  type LegacySystemRole,
  type RoleRow,
} from "@/lib/rbac-roles";

type CreateRolePayload = {
  display_name?: string;
  role_key?: string;
  permissions?: Record<string, unknown>;
  legacy_role?: LegacySystemRole | null;
};

export async function GET() {
  const access = await requireManageUsers();
  if (!access.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: access.status });
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("roles")
    .select("id, role_key, display_name, permissions, legacy_role, is_system")
    .order("is_system", { ascending: false })
    .order("display_name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({
    roles: ((data as RoleRow[] | null) ?? []).map(roleToPublicOption),
    role_lifecycle_enabled: isDynamicRolesEnabled(),
  });
}

export async function POST(request: Request) {
  const access = await requireManageUsers();
  if (!access.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: access.status });
  }
  if (!isDynamicRolesEnabled()) {
    return NextResponse.json({ error: "Role lifecycle is disabled by feature flag." }, { status: 403 });
  }

  const body = (await request.json()) as CreateRolePayload;
  const displayName = normalizeDisplayName(body.display_name ?? "");
  if (!displayName || displayName.length < 2 || displayName.length > 80) {
    return NextResponse.json({ error: "display_name must be 2-80 characters." }, { status: 400 });
  }

  const generatedRoleKey = normalizeRoleKey(body.role_key && body.role_key.trim() ? body.role_key : displayName);
  if (!generatedRoleKey || !isValidRoleKey(generatedRoleKey)) {
    return NextResponse.json({ error: "role_key must be snake_case [a-z0-9_]." }, { status: 400 });
  }

  const legacyRole = body.legacy_role === null ? null : body.legacy_role ?? "technician";
  if (legacyRole !== null && !isLegacySystemRole(legacyRole)) {
    return NextResponse.json({ error: "legacy_role is invalid." }, { status: 400 });
  }

  const permissions = sanitizePermissionPayload(body.permissions ?? {});
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("roles")
    .insert({
      role_key: generatedRoleKey,
      display_name: displayName,
      permissions,
      legacy_role: legacyRole,
      is_system: false,
    })
    .select("id, role_key, display_name, permissions, legacy_role, is_system")
    .single();

  if (error) {
    const status = error.code === "23505" ? 409 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json({ ok: true, role: roleToPublicOption(data as RoleRow) });
}

