import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type RolePayload = {
  role?:
    | "admin"
    | "projects_director"
    | "project_manager"
    | "engineer"
    | "supervisor"
    | "technician"
    | "reporter";
};

async function ensureAdminAccess() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false as const, status: 401 };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profileError || profile?.role !== "admin") {
    return { ok: false as const, status: 403 };
  }

  return { ok: true as const };
}

export async function PATCH(request: Request, context: { params: Promise<{ userId: string }> }) {
  const access = await ensureAdminAccess();
  if (!access.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: access.status });
  }

  const { userId } = await context.params;
  const body = (await request.json()) as RolePayload;
  const role = body.role;

  if (!role) {
    return NextResponse.json({ error: "Role is required." }, { status: 400 });
  }

  try {
    const adminSupabase = createSupabaseAdminClient();
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

