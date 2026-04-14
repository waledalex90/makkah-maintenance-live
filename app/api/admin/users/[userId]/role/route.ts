import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile, requireManageUsers } from "@/lib/auth-guards";
import { denyMutationOfProtectedSuperAdmin } from "@/lib/protected-super-admin";
import { mergeRoleAndUserOverrides, sanitizePermissionPayload, type RoleRow } from "@/lib/rbac-roles";
import { getTenantContext } from "@/lib/tenant-context";
import { resolveRoleForTenant } from "@/lib/server/tenant-roles";
import { recordSecurityEvent } from "@/lib/security-events";

type RolePayload = {
  role?: string;
  role_id?: string;
  role_key?: string;
};

export async function PATCH(request: Request, context: { params: Promise<{ userId: string }> }) {
  const access = await requireManageUsers();
  if (!access.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: access.status });
  }

  const { user: actor } = await getSessionProfile();
  if (!actor?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { userId } = await context.params;
  const body = (await request.json()) as RolePayload;
  const role = body.role_id?.trim() || body.role_key?.trim() || body.role?.trim();

  if (!role) {
    return NextResponse.json({ error: "Role is required." }, { status: 400 });
  }

  try {
    const adminSupabase = createSupabaseAdminClient();
    const tenant = await getTenantContext();
    if (!tenant.ok) {
      return NextResponse.json({ error: tenant.error }, { status: tenant.status });
    }
    const { data: targetAuth } = await adminSupabase.auth.admin.getUserById(userId);
    const { data: targetProfile } = await adminSupabase.from("profiles").select("company_id").eq("id", userId).maybeSingle();
    if (!tenant.isPlatformAdmin && targetProfile?.company_id !== tenant.activeCompanyId) {
      await recordSecurityEvent({
        event_type: "tenant_guard_reject",
        status_code: 403,
        message: "Cross-tenant role assignment blocked.",
        actor_user_id: tenant.userId,
        actor_company_id: tenant.activeCompanyId,
        metadata: { route: "admin/users/[userId]/role#PATCH", targetUserId: userId, targetCompanyId: targetProfile?.company_id ?? null },
      });
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const deny = denyMutationOfProtectedSuperAdmin(targetAuth?.user?.email, actor.email);
    if (deny) {
      return NextResponse.json({ error: deny }, { status: 403 });
    }

    const roleScopeCompanyId = tenant.activeCompanyId ?? targetProfile?.company_id ?? null;
    const { role: roleRow, error: roleError } = await resolveRoleForTenant(adminSupabase, role, roleScopeCompanyId);
    if (roleError || !roleRow) {
      return NextResponse.json({ error: roleError ?? "Role not found." }, { status: 400 });
    }

    const typedRole = roleRow as RoleRow;
    const { data: profile } = await adminSupabase.from("profiles").select("permissions").eq("id", userId).maybeSingle();
    const merged = mergeRoleAndUserOverrides(typedRole.permissions, profile?.permissions as Record<string, unknown> | null);
    const permissions = { ...sanitizePermissionPayload(merged), view_admin_reports: merged.view_reports };
    let updateQuery = adminSupabase
      .from("profiles")
      .update({ role: typedRole.legacy_role ?? "technician", role_id: typedRole.id, permissions })
      .eq("id", userId);
    if (!tenant.isPlatformAdmin || tenant.activeCompanyId) {
      updateQuery = updateQuery.eq("company_id", tenant.activeCompanyId ?? "");
    }
    const { error } = await updateQuery;

    if (!error && tenant.activeCompanyId) {
      await adminSupabase
        .from("company_memberships")
        .update({ role_id: typedRole.id })
        .eq("user_id", userId)
        .eq("company_id", tenant.activeCompanyId);
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

