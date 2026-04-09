import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type ProfileRow = {
  id: string;
  full_name: string;
  mobile: string;
  role:
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

export async function GET() {
  const access = await ensureAdminAccess();
  if (!access.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: access.status });
  }

  try {
    const adminSupabase = createSupabaseAdminClient();

    const [{ data: profiles, error: profilesError }, usersResult] = await Promise.all([
      adminSupabase.from("profiles").select("id, full_name, mobile, role"),
      adminSupabase.auth.admin.listUsers(),
    ]);

    if (profilesError) {
      return NextResponse.json({ error: profilesError.message }, { status: 400 });
    }

    if (usersResult.error) {
      return NextResponse.json({ error: usersResult.error.message }, { status: 400 });
    }

    const userMap = new Map(usersResult.data.users.map((u) => [u.id, u]));
    const rows = ((profiles as ProfileRow[]) ?? []).map((profile) => {
      const authUser = userMap.get(profile.id);
      const email = authUser?.email ?? "غير متوفر";
      const status = authUser?.email_confirmed_at ? "نشط" : "بانتظار التفعيل";

      return {
        id: profile.id,
        full_name: profile.full_name,
        mobile: profile.mobile,
        role: profile.role,
        email,
        account_status: status,
      };
    });

    return NextResponse.json({ users: rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

type InvitePayload = {
  email?: string;
  full_name?: string;
  mobile?: string;
  role?:
    | "admin"
    | "projects_director"
    | "project_manager"
    | "engineer"
    | "supervisor"
    | "technician"
    | "reporter";
};

export async function POST(request: Request) {
  const access = await ensureAdminAccess();
  if (!access.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: access.status });
  }

  const body = (await request.json()) as InvitePayload;
  const email = body.email?.trim().toLowerCase() ?? "";
  const fullName = body.full_name?.trim() ?? "";
  const mobile = body.mobile?.trim() ?? "";
  const role = body.role ?? "technician";

  if (!email || !fullName || !mobile) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }

  try {
    const adminSupabase = createSupabaseAdminClient();
    const { data: invitedData, error: inviteError } = await adminSupabase.auth.admin.inviteUserByEmail(email);

    if (inviteError) {
      return NextResponse.json({ error: inviteError.message }, { status: 400 });
    }

    const invitedUserId = invitedData.user?.id;
    if (!invitedUserId) {
      return NextResponse.json({ error: "Failed to resolve invited user id." }, { status: 400 });
    }

    const { error: upsertError } = await adminSupabase.from("profiles").upsert(
      {
        id: invitedUserId,
        full_name: fullName,
        mobile,
        role,
      },
      { onConflict: "id" },
    );

    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

