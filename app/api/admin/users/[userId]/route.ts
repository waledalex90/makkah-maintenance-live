import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile, requireManageUsers } from "@/lib/auth-guards";
import { denyDeleteProtectedSuperAdmin, denyMutationOfProtectedSuperAdmin } from "@/lib/protected-super-admin";
import { parseUsernameOrEmailLocalPart, toAuthEmail } from "@/lib/username-auth";
import { mergePermissionsWithUnset } from "@/lib/dashboard-user-permissions";
import { mergeRoleAndUserOverrides, sanitizePermissionPayload, type RoleRow } from "@/lib/rbac-roles";
import { getTenantContext } from "@/lib/tenant-context";
import { resolveRoleForTenant } from "@/lib/server/tenant-roles";
import { recordSecurityEvent } from "@/lib/security-events";

type ProfilePermissionsRow = {
  permissions?: Record<string, unknown> | null;
  roles?: { permissions?: Record<string, unknown> | null } | { permissions?: Record<string, unknown> | null }[] | null;
};

type PatchBody = {
  /** تعديل اسم الدخول الظاهر — يُحدَّث البريد الاصطناعي في Auth عند الحاجة */
  username?: string;
  full_name?: string;
  role?: string;
  role_id?: string;
  role_key?: string;
  region?: string | null;
  specialty?: "fire" | "electricity" | "ac" | "civil" | "kitchens" | null;
  /** واجهة مهام الميدان */
  access_work_list?: boolean;
  zone_ids?: string[];
  permissions?: Record<string, unknown>;
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
  const body = (await request.json()) as PatchBody;
  const admin = createSupabaseAdminClient();
  const tenant = await getTenantContext();
  if (!tenant.ok) {
    return NextResponse.json({ error: tenant.error }, { status: tenant.status });
  }

  const { data: targetAuth } = await admin.auth.admin.getUserById(userId);
  const { data: targetProfile } = await admin.from("profiles").select("company_id").eq("id", userId).maybeSingle();
  if (!tenant.isPlatformAdmin && targetProfile?.company_id !== tenant.activeCompanyId) {
    await recordSecurityEvent({
      event_type: "tenant_guard_reject",
      status_code: 403,
      message: "Cross-tenant user mutation blocked.",
      actor_user_id: tenant.userId,
      actor_company_id: tenant.activeCompanyId,
      metadata: { route: "admin/users/[userId]#PATCH", targetUserId: userId, targetCompanyId: targetProfile?.company_id ?? null },
    });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const deny = denyMutationOfProtectedSuperAdmin(targetAuth?.user?.email, actor.email);
  if (deny) {
    return NextResponse.json({ error: deny }, { status: 403 });
  }

  const updates: Record<string, unknown> = {};
  if (typeof body.username === "string") {
    const next = parseUsernameOrEmailLocalPart(body.username);
    if (!next) {
      return NextResponse.json({ error: "اسم المستخدم غير صالح." }, { status: 400 });
    }
    let newEmail: string;
    try {
      newEmail = toAuthEmail(next);
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "اسم المستخدم غير صالح." }, { status: 400 });
    }
    if (!targetAuth?.user?.email) {
      return NextResponse.json({ error: "تعذر قراءة حساب المستخدم." }, { status: 400 });
    }
    const currentEmail = targetAuth.user.email.toLowerCase();
    if (newEmail.toLowerCase() !== currentEmail) {
      const { error: authUpErr } = await admin.auth.admin.updateUserById(userId, { email: newEmail });
      if (authUpErr) {
        return NextResponse.json({ error: authUpErr.message }, { status: 400 });
      }
    }
    updates.username = next;
  }
  if (typeof body.full_name === "string") updates.full_name = body.full_name.trim();
  const requestedRole = body.role_id?.trim() || body.role_key?.trim() || body.role?.trim();
  if (requestedRole) {
    const roleScopeCompanyId = tenant.activeCompanyId ?? targetProfile?.company_id ?? null;
    const { role: roleRow, error: roleError } = await resolveRoleForTenant(admin, requestedRole, roleScopeCompanyId);
    if (roleError || !roleRow) {
      return NextResponse.json({ error: roleError ?? "دور غير صالح." }, { status: 400 });
    }
    const r = roleRow as RoleRow;
    updates.role = r.legacy_role ?? "technician";
    updates.role_id = r.id;
  }
  if (body.region !== undefined) updates.region = body.region === null || body.region === "" ? null : String(body.region).trim();
  if (body.specialty !== undefined) updates.specialty = body.specialty;
  if (typeof body.access_work_list === "boolean") updates.access_work_list = body.access_work_list;
  if (body.permissions !== undefined && typeof body.permissions === "object" && body.permissions !== null) {
    const { data: current } = await admin
      .from("profiles")
      .select("permissions, role_id, roles:role_id(permissions)")
      .eq("id", userId)
      .single();
    const currentRow = (current ?? null) as ProfilePermissionsRow | null;
    const prev = (currentRow?.permissions as Record<string, unknown> | null) ?? {};
    const rolePerms = Array.isArray(currentRow?.roles) ? currentRow.roles[0]?.permissions : currentRow?.roles?.permissions;
    const merged = mergePermissionsWithUnset(rolePerms, prev, body.permissions);
    const finalPerms = mergeRoleAndUserOverrides(rolePerms, merged);
    updates.permissions = { ...sanitizePermissionPayload(finalPerms), view_admin_reports: finalPerms.view_reports };
  }
  if (requestedRole && body.permissions === undefined) {
    const { data: current } = await admin
      .from("profiles")
      .select("permissions, roles:role_id(permissions)")
      .eq("id", userId)
      .single();
    const currentRow = (current ?? null) as ProfilePermissionsRow | null;
    const rolePerms = Array.isArray(currentRow?.roles) ? currentRow.roles[0]?.permissions : currentRow?.roles?.permissions;
    const merged = mergeRoleAndUserOverrides(rolePerms, currentRow?.permissions as Record<string, unknown> | null);
    updates.permissions = { ...sanitizePermissionPayload(merged), view_admin_reports: merged.view_reports };
  }

  if (Object.keys(updates).length > 0) {
    let updateQuery = admin.from("profiles").update(updates).eq("id", userId);
    if (!tenant.isPlatformAdmin || tenant.activeCompanyId) {
      updateQuery = updateQuery.eq("company_id", tenant.activeCompanyId ?? "");
    }
    const { error: upErr } = await updateQuery;
    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 400 });
    }
  }

  if (requestedRole && updates.role_id && tenant.activeCompanyId) {
    await admin
      .from("company_memberships")
      .update({ role_id: updates.role_id as string })
      .eq("user_id", userId)
      .eq("company_id", tenant.activeCompanyId);
  }

  if (Array.isArray(body.zone_ids)) {
    const zoneIds = body.zone_ids.filter((id) => typeof id === "string");
    const zoneCompanyId = tenant.activeCompanyId ?? targetProfile?.company_id ?? null;
    if (!zoneCompanyId) {
      return NextResponse.json({ error: "missing_active_company" }, { status: 403 });
    }
    let deleteZoneQuery = admin.from("zone_profiles").delete().eq("profile_id", userId);
    if (!tenant.isPlatformAdmin || tenant.activeCompanyId) {
      deleteZoneQuery = deleteZoneQuery.eq("company_id", tenant.activeCompanyId ?? "");
    }
    const { error: delErr } = await deleteZoneQuery;
    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 400 });
    }
    if (zoneIds.length > 0) {
      const { data: tenantZones, error: zoneScopeError } = await admin
        .from("zones")
        .select("id")
        .eq("company_id", zoneCompanyId)
        .in("id", zoneIds);
      if (zoneScopeError) {
        return NextResponse.json({ error: zoneScopeError.message }, { status: 400 });
      }
      const allowed = new Set((tenantZones ?? []).map((z) => z.id as string));
      if (zoneIds.some((id) => !allowed.has(id))) {
        return NextResponse.json({ error: "zone_ids خارج نطاق الشركة النشطة." }, { status: 403 });
      }
      const { error: insErr } = await admin.from("zone_profiles").insert(
        zoneIds.map((zone_id) => ({ zone_id, profile_id: userId, company_id: zoneCompanyId })),
      );
      if (insErr) {
        return NextResponse.json({ error: insErr.message }, { status: 400 });
      }
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, context: { params: Promise<{ userId: string }> }) {
  const access = await requireManageUsers();
  if (!access.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: access.status });
  }

  const { userId } = await context.params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user?.id === userId) {
    return NextResponse.json({ error: "Cannot delete your own account." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const tenant = await getTenantContext();
  if (!tenant.ok) {
    return NextResponse.json({ error: tenant.error }, { status: tenant.status });
  }
  const { data: targetAuth } = await admin.auth.admin.getUserById(userId);
  const denyDel = denyDeleteProtectedSuperAdmin(targetAuth?.user?.email);
  if (denyDel) {
    return NextResponse.json({ error: denyDel }, { status: 403 });
  }

  const { data: targetProfile } = await admin.from("profiles").select("company_id").eq("id", userId).maybeSingle();
  if (!tenant.isPlatformAdmin && targetProfile?.company_id !== tenant.activeCompanyId) {
    await recordSecurityEvent({
      event_type: "tenant_guard_reject",
      status_code: 403,
      message: "Cross-tenant user delete blocked.",
      actor_user_id: tenant.userId,
      actor_company_id: tenant.activeCompanyId,
      metadata: { route: "admin/users/[userId]#DELETE", targetUserId: userId, targetCompanyId: targetProfile?.company_id ?? null },
    });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error: authErr } = await admin.auth.admin.deleteUser(userId);
  if (authErr) {
    return NextResponse.json({ error: authErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
