import { NextResponse } from "next/server";
import { requireManageUsers } from "@/lib/auth-guards";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
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

type PatchRolePayload = {
  display_name?: string;
  role_key?: string;
  permissions?: Record<string, unknown>;
  legacy_role?: LegacySystemRole | null;
};

export async function PATCH(request: Request, context: { params: Promise<{ roleId: string }> }) {
  const access = await requireManageUsers();
  if (!access.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: access.status });
  }

  const { roleId } = await context.params;
  const body = (await request.json()) as PatchRolePayload;
  const updates: Record<string, unknown> = {};

  if (body.display_name !== undefined) {
    const displayName = normalizeDisplayName(body.display_name);
    if (!displayName || displayName.length < 2 || displayName.length > 80) {
      return NextResponse.json({ error: "display_name must be 2-80 characters." }, { status: 400 });
    }
    updates.display_name = displayName;
  }

  if (body.role_key !== undefined) {
    const roleKey = normalizeRoleKey(body.role_key);
    if (!roleKey || !isValidRoleKey(roleKey)) {
      return NextResponse.json({ error: "role_key must be snake_case [a-z0-9_]." }, { status: 400 });
    }
    updates.role_key = roleKey;
  }

  if (body.permissions !== undefined) {
    updates.permissions = sanitizePermissionPayload(body.permissions);
  }

  if (body.legacy_role !== undefined) {
    if (body.legacy_role !== null && !isLegacySystemRole(body.legacy_role)) {
      return NextResponse.json({ error: "legacy_role is invalid." }, { status: 400 });
    }
    updates.legacy_role = body.legacy_role;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("roles")
    .update(updates)
    .eq("id", roleId)
    .select("id, role_key, display_name, permissions, legacy_role, is_system")
    .single();

  if (error) {
    const status = error.code === "23505" ? 409 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json({ ok: true, role: roleToPublicOption(data as RoleRow) });
}

