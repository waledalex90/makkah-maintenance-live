import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile, requireManageUsers } from "@/lib/auth-guards";
import { denyMutationOfProtectedSuperAdmin } from "@/lib/protected-super-admin";
import { getTenantContext } from "@/lib/tenant-context";
import { recordSecurityEvent } from "@/lib/security-events";

type PasswordPayload = {
  password?: string;
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
  const body = (await request.json()) as PasswordPayload;
  const password = body.password?.trim() ?? "";

  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  try {
    const adminSupabase = createSupabaseAdminClient();
    const tenant = await getTenantContext();
    if (!tenant.ok) {
      return NextResponse.json({ error: tenant.error }, { status: tenant.status });
    }
    const { data: targetAuth } = await adminSupabase.auth.admin.getUserById(userId);
    const deny = denyMutationOfProtectedSuperAdmin(targetAuth?.user?.email, actor.email);
    if (deny) {
      return NextResponse.json({ error: deny }, { status: 403 });
    }

    const { data: targetProfile } = await adminSupabase.from("profiles").select("company_id").eq("id", userId).maybeSingle();
    if (!tenant.isPlatformAdmin && targetProfile?.company_id !== tenant.activeCompanyId) {
      await recordSecurityEvent({
        event_type: "tenant_guard_reject",
        status_code: 403,
        message: "Cross-tenant password reset blocked.",
        actor_user_id: tenant.userId,
        actor_company_id: tenant.activeCompanyId,
        metadata: { route: "admin/users/[userId]/password#PATCH", targetUserId: userId, targetCompanyId: targetProfile?.company_id ?? null },
      });
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { error } = await adminSupabase.auth.admin.updateUserById(userId, { password });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
