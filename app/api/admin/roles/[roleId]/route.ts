import { NextResponse } from "next/server";
import { requireManageUsers } from "@/lib/auth-guards";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isDynamicRolesEnabled } from "@/lib/feature-flags";
import { getTenantContext } from "@/lib/tenant-context";
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

  const tenant = await getTenantContext();
  if (!tenant.ok) {
    return NextResponse.json({ error: tenant.error }, { status: tenant.status });
  }
  if (!tenant.activeCompanyId) {
    return NextResponse.json({ error: "missing_active_company" }, { status: 403 });
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
  const { data: targetRole, error: roleScopeError } = await admin
    .from("roles")
    .select("id, is_system, company_id")
    .eq("id", roleId)
    .maybeSingle();
  if (roleScopeError) {
    return NextResponse.json({ error: roleScopeError.message }, { status: 400 });
  }
  if (!targetRole) {
    return NextResponse.json({ error: "Role not found." }, { status: 404 });
  }
  if (targetRole.is_system || !targetRole.company_id) {
    return NextResponse.json({ error: "Global/system roles are immutable." }, { status: 403 });
  }
  if (targetRole.company_id !== tenant.activeCompanyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (typeof updates.role_key === "string") {
    const { data: roleConflict, error: conflictError } = await admin
      .from("roles")
      .select("id")
      .eq("role_key", updates.role_key)
      .or(`company_id.is.null,company_id.eq.${tenant.activeCompanyId}`)
      .neq("id", roleId)
      .limit(1)
      .maybeSingle();
    if (conflictError) {
      return NextResponse.json({ error: conflictError.message }, { status: 400 });
    }
    if (roleConflict) {
      return NextResponse.json({ error: "role_key already exists in this scope." }, { status: 409 });
    }
  }

  const { data, error } = await admin
    .from("roles")
    .update(updates)
    .eq("id", roleId)
    .eq("company_id", tenant.activeCompanyId)
    .select("id, role_key, display_name, permissions, legacy_role, is_system, company_id")
    .single();

  if (error) {
    const status = error.code === "23505" ? 409 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json({ ok: true, role: roleToPublicOption(data as RoleRow) });
}

export async function DELETE(_request: Request, context: { params: Promise<{ roleId: string }> }) {
  const access = await requireManageUsers();
  if (!access.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: access.status });
  }
  if (!isDynamicRolesEnabled()) {
    return NextResponse.json({ error: "Role lifecycle is disabled by feature flag." }, { status: 403 });
  }
  const tenant = await getTenantContext();
  if (!tenant.ok) {
    return NextResponse.json({ error: tenant.error }, { status: tenant.status });
  }
  if (!tenant.activeCompanyId) {
    return NextResponse.json({ error: "missing_active_company" }, { status: 403 });
  }

  const { roleId } = await context.params;
  const admin = createSupabaseAdminClient();
  const { data: role, error: roleError } = await admin
    .from("roles")
    .select("id, is_system, company_id")
    .eq("id", roleId)
    .maybeSingle();

  if (roleError) {
    return NextResponse.json({ error: roleError.message }, { status: 400 });
  }
  if (!role) {
    return NextResponse.json({ error: "Role not found." }, { status: 404 });
  }
  if (role.is_system || !role.company_id) {
    return NextResponse.json({ error: "Cannot delete global/system role." }, { status: 403 });
  }
  if (role.company_id !== tenant.activeCompanyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { count, error: countError } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role_id", roleId);
  if (countError) {
    return NextResponse.json({ error: countError.message }, { status: 400 });
  }
  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: "Cannot delete role while users are assigned to it. Reassign users first." },
      { status: 409 },
    );
  }

  const { count: membershipCount, error: membershipCountError } = await admin
    .from("company_memberships")
    .select("id", { count: "exact", head: true })
    .eq("role_id", roleId);
  if (membershipCountError) {
    return NextResponse.json({ error: membershipCountError.message }, { status: 400 });
  }
  if ((membershipCount ?? 0) > 0) {
    return NextResponse.json(
      { error: "Cannot delete role while users are assigned to it. Reassign users first." },
      { status: 409 },
    );
  }

  const { error } = await admin.from("roles").delete().eq("id", roleId).eq("company_id", tenant.activeCompanyId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

