import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

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

    const userMap = new Map(usersResult.data.users.map((u) => [u.id, u]));
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
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

type InvitePayload = {
  email?: string;
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

export async function POST(request: Request) {
  const access = await ensureAdminAccess();
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

  if (!email || !fullName || !mobile || !jobTitle || zoneIds.length === 0) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }

  try {
    const adminSupabase = createSupabaseAdminClient();
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

    const { error: upsertError } = await adminSupabase.from("profiles").upsert(
      {
        id: invitedUserId,
        full_name: fullName,
        mobile,
        job_title: jobTitle,
        specialty: specialty,
        role,
      },
      { onConflict: "id" },
    );

    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 400 });
    }

    const { error: deleteZonesError } = await adminSupabase
      .from("zone_profiles")
      .delete()
      .eq("profile_id", invitedUserId);
    if (deleteZonesError) {
      return NextResponse.json({ error: deleteZonesError.message }, { status: 400 });
    }

    const { error: insertZonesError } = await adminSupabase.from("zone_profiles").insert(
      zoneIds.map((zoneId) => ({
        zone_id: zoneId,
        profile_id: invitedUserId,
      })),
    );
    if (insertZonesError) {
      return NextResponse.json({ error: insertZonesError.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

