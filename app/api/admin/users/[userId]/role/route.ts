import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile, requireManageUsers } from "@/lib/auth-guards";
import { denyMutationOfProtectedSuperAdmin } from "@/lib/protected-super-admin";
import { mergeRoleAndUserOverrides, sanitizePermissionPayload, type RoleRow } from "@/lib/rbac-roles";

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
    const { data: targetAuth } = await adminSupabase.auth.admin.getUserById(userId);
    const deny = denyMutationOfProtectedSuperAdmin(targetAuth?.user?.email, actor.email);
    if (deny) {
      return NextResponse.json({ error: deny }, { status: 403 });
    }

    const { data: roleRow, error: roleError } = await adminSupabase
      .from("roles")
      .select("id, role_key, display_name, permissions, legacy_role, is_system")
      .or(`id.eq.${role},role_key.eq.${role}`)
      .maybeSingle();
    if (roleError || !roleRow) {
      return NextResponse.json({ error: roleError?.message ?? "Role not found." }, { status: 400 });
    }

    const typedRole = roleRow as RoleRow;
    const { data: profile } = await adminSupabase.from("profiles").select("permissions").eq("id", userId).maybeSingle();
    const merged = mergeRoleAndUserOverrides(typedRole.permissions, profile?.permissions as Record<string, unknown> | null);
    const permissions = { ...sanitizePermissionPayload(merged), view_admin_reports: merged.view_reports };
    const { error } = await adminSupabase
      .from("profiles")
      .update({ role: typedRole.legacy_role ?? "technician", role_id: typedRole.id, permissions })
      .eq("id", userId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

