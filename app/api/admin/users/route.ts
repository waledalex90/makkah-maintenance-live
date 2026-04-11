import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireManageUsers } from "@/lib/auth-guards";

type ProfileRow = {
  id: string;
  full_name: string;
  mobile: string;
  job_title?: string | null;
  specialty?: string | null;
  region?: string | null;
  permissions?: Record<string, unknown> | null;
  role:
    | "admin"
    | "projects_director"
    | "project_manager"
    | "engineer"
    | "supervisor"
    | "technician"
    | "reporter";
};

export async function GET() {
  const access = await requireManageUsers();
  if (!access.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: access.status });
  }

  try {
    const supabase = await createSupabaseServerClient();
    const adminSupabase = createSupabaseAdminClient();

    const [{ data: profiles, error: profilesError }, usersResult] = await Promise.all([
      adminSupabase.from("profiles").select("id, full_name, mobile, role, job_title, specialty, region, permissions"),
      adminSupabase.auth.admin.listUsers(),
    ]);

    if (profilesError) {
      return NextResponse.json({ error: profilesError.message }, { status: 400 });
    }

    if (usersResult.error) {
      // Fallback: if admin key is invalid/missing, still return profiles so management table is usable.
      const { data: fallbackProfiles, error: fallbackProfilesError } = await supabase
        .from("profiles")
        .select("id, full_name, mobile, role, job_title, specialty, region, permissions");

      const profileIds = ((fallbackProfiles as ProfileRow[]) ?? []).map((p) => p.id);
      const { data: zoneLinks } = profileIds.length
        ? await supabase
            .from("zone_profiles")
            .select("profile_id, zones(id, name)")
            .in("profile_id", profileIds)
        : { data: [] as Array<{ profile_id: string; zones: { id: string; name: string } | { id: string; name: string }[] | null }> };

      if (fallbackProfilesError) {
        return NextResponse.json({ error: usersResult.error.message }, { status: 400 });
      }

      const zoneMap = new Map<string, Array<{ id: string; name: string }>>();
      (zoneLinks ?? []).forEach((link) => {
        const zone = Array.isArray(link.zones) ? link.zones[0] : link.zones;
        if (!zone) return;
        const current = zoneMap.get(link.profile_id) ?? [];
        current.push({ id: zone.id, name: zone.name });
        zoneMap.set(link.profile_id, current);
      });

      const fallbackRows = ((fallbackProfiles as ProfileRow[]) ?? []).map((profile) => ({
        id: profile.id,
        full_name: profile.full_name,
        mobile: profile.mobile,
        job_title: profile.job_title ?? "",
        specialty: profile.specialty ?? "",
        region: profile.region ?? "",
        permissions: profile.permissions ?? {},
        role: profile.role,
        email: "غير متوفر",
        account_status: "غير متوفر",
        zones: zoneMap.get(profile.id) ?? [],
      }));

      const { data: fallbackZones } = await supabase.from("zones").select("id, name").order("name");
      return NextResponse.json({ users: fallbackRows, zones: fallbackZones ?? [] });
    }

    const profileIds = ((profiles as ProfileRow[]) ?? []).map((p) => p.id);
    const { data: zoneLinks } = profileIds.length
      ? await adminSupabase
          .from("zone_profiles")
          .select("profile_id, zones(id, name)")
          .in("profile_id", profileIds)
      : { data: [] as Array<{ profile_id: string; zones: { id: string; name: string } | { id: string; name: string }[] | null }> };
    const zoneMap = new Map<string, Array<{ id: string; name: string }>>();
    (zoneLinks ?? []).forEach((link) => {
      const zone = Array.isArray(link.zones) ? link.zones[0] : link.zones;
      if (!zone) return;
      const current = zoneMap.get(link.profile_id) ?? [];
      current.push({ id: zone.id, name: zone.name });
      zoneMap.set(link.profile_id, current);
    });

    const authUsers = usersResult.data?.users ?? [];
    const userMap = new Map(authUsers.map((u) => [u.id, u]));
    const rows = ((profiles as ProfileRow[]) ?? []).map((profile) => {
      const authUser = userMap.get(profile.id);
      const email = authUser?.email ?? "غير متوفر";
      const status = authUser?.email_confirmed_at ? "نشط" : "بانتظار التفعيل";

      return {
        id: profile.id,
        full_name: profile.full_name,
        mobile: profile.mobile,
        job_title: profile.job_title ?? "",
        specialty: profile.specialty ?? "",
        region: profile.region ?? "",
        permissions: profile.permissions ?? {},
        role: profile.role,
        email,
        account_status: status,
        zones: zoneMap.get(profile.id) ?? [],
      };
    });

    const { data: zones } = await adminSupabase.from("zones").select("id, name").order("name");
    return NextResponse.json({ users: rows, zones: zones ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status = message.includes("Missing Supabase admin") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

type InvitePayload = {
  mode?: "invite" | "direct_password";
  email?: string;
  password?: string;
  full_name?: string;
  mobile?: string;
  job_title?: string;
  specialty?: "fire" | "electricity" | "ac" | "civil" | "kitchens";
  zone_ids?: string[];
  role?:
    | "admin"
    | "projects_director"
    | "project_manager"
    | "engineer"
    | "supervisor"
    | "technician"
    | "reporter";
};

async function upsertProfileAndZones(
  adminSupabase: ReturnType<typeof createSupabaseAdminClient>,
  userId: string,
  params: {
    fullName: string;
    mobile: string;
    jobTitle: string;
    specialty: string;
    role: InvitePayload["role"];
    zoneIds: string[];
  },
) {
  const { fullName, mobile, jobTitle, specialty, role, zoneIds } = params;
  const { error: upsertError } = await adminSupabase.from("profiles").upsert(
    {
      id: userId,
      full_name: fullName,
      mobile,
      job_title: jobTitle,
      specialty: specialty,
      role: role ?? "technician",
    },
    { onConflict: "id" },
  );

  if (upsertError) {
    return upsertError;
  }

  const { error: deleteZonesError } = await adminSupabase.from("zone_profiles").delete().eq("profile_id", userId);
  if (deleteZonesError) {
    return deleteZonesError;
  }

  if (zoneIds.length > 0) {
    const { error: insertZonesError } = await adminSupabase.from("zone_profiles").insert(
      zoneIds.map((zoneId) => ({
        zone_id: zoneId,
        profile_id: userId,
      })),
    );
    if (insertZonesError) {
      return insertZonesError;
    }
  }

  return null;
}

export async function POST(request: Request) {
  const access = await requireManageUsers();
  if (!access.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: access.status });
  }

  const body = (await request.json()) as InvitePayload;
  const email = body.email?.trim().toLowerCase() ?? "";
  const fullName = body.full_name?.trim() ?? "";
  const mobile = body.mobile?.trim() ?? "";
  const jobTitle = body.job_title?.trim() ?? "";
  const specialty = body.specialty ?? "civil";
  const zoneIds = Array.isArray(body.zone_ids) ? body.zone_ids.filter((value) => typeof value === "string") : [];
  const role = body.role ?? "technician";
  const mode = body.mode ?? "invite";

  if (!email || !fullName || !mobile || !jobTitle || zoneIds.length === 0) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }

  if (mode === "direct_password") {
    const password = body.password?.trim() ?? "";
    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }
  }

  try {
    const adminSupabase = createSupabaseAdminClient();

    if (mode === "direct_password") {
      const password = body.password?.trim() ?? "";
      const { data: created, error: createError } = await adminSupabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

      if (createError) {
        return NextResponse.json({ error: createError.message }, { status: 400 });
      }

      const newUserId = created.user?.id;
      if (!newUserId) {
        return NextResponse.json({ error: "Failed to resolve new user id." }, { status: 400 });
      }

      const zoneErr = await upsertProfileAndZones(adminSupabase, newUserId, {
        fullName,
        mobile,
        jobTitle,
        specialty,
        role,
        zoneIds,
      });
      if (zoneErr) {
        await adminSupabase.auth.admin.deleteUser(newUserId);
        return NextResponse.json({ error: zoneErr.message }, { status: 400 });
      }

      return NextResponse.json({ ok: true });
    }

    const appBaseUrl =
      process.env.NEXT_PUBLIC_APP_URL ??
      process.env.NEXT_PUBLIC_SITE_URL ??
      process.env.SITE_URL ??
      "";
    const redirectTo = appBaseUrl ? `${appBaseUrl.replace(/\/+$/, "")}/login` : undefined;
    const { data: invitedData, error: inviteError } = await adminSupabase.auth.admin.inviteUserByEmail(email, {
      redirectTo,
    });

    if (inviteError) {
      return NextResponse.json({ error: inviteError.message }, { status: 400 });
    }

    const invitedUserId = invitedData.user?.id;
    if (!invitedUserId) {
      return NextResponse.json({ error: "Failed to resolve invited user id." }, { status: 400 });
    }

    const zoneErr = await upsertProfileAndZones(adminSupabase, invitedUserId, {
      fullName,
      mobile,
      jobTitle,
      specialty,
      role,
      zoneIds,
    });
    if (zoneErr) {
      return NextResponse.json({ error: zoneErr.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status = message.includes("Missing Supabase admin") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

