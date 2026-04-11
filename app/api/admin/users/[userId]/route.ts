import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireManageUsers } from "@/lib/auth-guards";

type PatchBody = {
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
  zone_ids?: string[];
  permissions?: Record<string, unknown>;
};

export async function PATCH(request: Request, context: { params: Promise<{ userId: string }> }) {
  const access = await requireManageUsers();
  if (!access.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: access.status });
  }

  const { userId } = await context.params;
  const body = (await request.json()) as PatchBody;
  const admin = createSupabaseAdminClient();

  const updates: Record<string, unknown> = {};
  if (typeof body.full_name === "string") updates.full_name = body.full_name.trim();
  if (body.role !== undefined) updates.role = body.role;
  if (body.region !== undefined) updates.region = body.region === null || body.region === "" ? null : String(body.region).trim();
  if (body.specialty !== undefined) updates.specialty = body.specialty;
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
  const { error: authErr } = await admin.auth.admin.deleteUser(userId);
  if (authErr) {
    return NextResponse.json({ error: authErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
