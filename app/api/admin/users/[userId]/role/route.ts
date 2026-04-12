import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile, requireManageUsers } from "@/lib/auth-guards";
import { denyMutationOfProtectedSuperAdmin } from "@/lib/protected-super-admin";

type RolePayload = {
  role?:
    | "admin"
    | "projects_director"
    | "project_manager"
    | "engineer"
    | "supervisor"
    | "technician"
    | "reporter"
    | "data_entry";
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
  const role = body.role;

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

    const { error } = await adminSupabase.from("profiles").update({ role }).eq("id", userId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

