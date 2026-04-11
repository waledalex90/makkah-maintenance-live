import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile, requireManageUsers } from "@/lib/auth-guards";
import { denyDeleteProtectedSuperAdmin, denyMutationOfProtectedSuperAdmin } from "@/lib/protected-super-admin";
import { parseUsernameOrEmailLocalPart, toAuthEmail } from "@/lib/username-auth";

type PatchBody = {
  /** تعديل اسم الدخول الظاهر — يُحدَّث البريد الاصطناعي في Auth عند الحاجة */
  username?: string;
  full_name?: string;
  role?:
    | "admin"
    | "projects_director"
    | "project_manager"
    | "engineer"
    | "supervisor"
    | "technician"
    | "reporter";
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

  const { data: targetAuth } = await admin.auth.admin.getUserById(userId);
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
  if (body.role !== undefined) updates.role = body.role;
  if (body.region !== undefined) updates.region = body.region === null || body.region === "" ? null : String(body.region).trim();
  if (body.specialty !== undefined) updates.specialty = body.specialty;
  if (typeof body.access_work_list === "boolean") updates.access_work_list = body.access_work_list;
  if (body.permissions !== undefined && typeof body.permissions === "object" && body.permissions !== null) {
    const { data: current } = await admin.from("profiles").select("permissions").eq("id", userId).single();
    const prev = (current?.permissions as Record<string, unknown> | null) ?? {};
    const merged = { ...prev, ...body.permissions } as Record<string, unknown>;
    if (merged.view_reports !== undefined) {
      merged.view_admin_reports = merged.view_reports;
    }
    updates.permissions = merged;
  }

  if (Object.keys(updates).length > 0) {
    const { error: upErr } = await admin.from("profiles").update(updates).eq("id", userId);
    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 400 });
    }
  }

  if (Array.isArray(body.zone_ids)) {
    const zoneIds = body.zone_ids.filter((id) => typeof id === "string");
    const { error: delErr } = await admin.from("zone_profiles").delete().eq("profile_id", userId);
    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 400 });
    }
    if (zoneIds.length > 0) {
      const { error: insErr } = await admin.from("zone_profiles").insert(
        zoneIds.map((zone_id) => ({ zone_id, profile_id: userId })),
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
  const { data: targetAuth } = await admin.auth.admin.getUserById(userId);
  const denyDel = denyDeleteProtectedSuperAdmin(targetAuth?.user?.email);
  if (denyDel) {
    return NextResponse.json({ error: denyDel }, { status: 403 });
  }

  const { error: authErr } = await admin.auth.admin.deleteUser(userId);
  if (authErr) {
    return NextResponse.json({ error: authErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
