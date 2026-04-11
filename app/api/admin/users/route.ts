import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireManageUsers } from "@/lib/auth-guards";
import { mergeInvitePermissions } from "@/lib/dashboard-user-permissions";
import { upsertProfileAndZones } from "@/lib/server/provision-dashboard-user";
import { parseUsernameOrEmailLocalPart, toAuthEmail, displayLoginIdentifier } from "@/lib/username-auth";
import type { AppPermissionKey } from "@/lib/permissions";
import { isProtectedSuperAdminEmail } from "@/lib/protected-super-admin";

type ProfileRow = {
  id: string;
  full_name: string;
  mobile: string;
  job_title?: string | null;
  specialty?: string | null;
  region?: string | null;
  username?: string | null;
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

const PROFILE_SELECT =
  "id, full_name, mobile, role, job_title, specialty, region, permissions, username";

async function buildZoneMapForProfiles(
  adminSupabase: ReturnType<typeof createSupabaseAdminClient>,
  profileIds: string[],
): Promise<Map<string, Array<{ id: string; name: string }>>> {
  const zoneMap = new Map<string, Array<{ id: string; name: string }>>();
  if (profileIds.length === 0) return zoneMap;
  const { data: zoneLinks } = await adminSupabase
    .from("zone_profiles")
    .select("profile_id, zones(id, name)")
    .in("profile_id", profileIds);
  (zoneLinks ?? []).forEach((link) => {
    const zone = Array.isArray(link.zones) ? link.zones[0] : link.zones;
    if (!zone) return;
    const current = zoneMap.get(link.profile_id) ?? [];
    current.push({ id: zone.id, name: zone.name });
    zoneMap.set(link.profile_id, current);
  });
  return zoneMap;
}

async function mapProfilesToUserRows(
  adminSupabase: ReturnType<typeof createSupabaseAdminClient>,
  list: ProfileRow[],
  zoneMap: Map<string, Array<{ id: string; name: string }>>,
) {
  const authById = new Map<string, { email?: string | null; email_confirmed_at?: string | null }>();
  await Promise.all(
    list.map(async (p) => {
      const { data, error } = await adminSupabase.auth.admin.getUserById(p.id);
      if (!error && data?.user) {
        authById.set(p.id, {
          email: data.user.email,
          email_confirmed_at: data.user.email_confirmed_at ?? null,
        });
      }
    }),
  );

  return list.map((profile) => {
    const authUser = authById.get(profile.id);
    const email = authUser?.email ?? "غير متوفر";
    const accountStatus = authUser?.email_confirmed_at ? "نشط" : "بانتظار التفعيل";
    const displayUser = profile.username?.trim() || displayLoginIdentifier(authUser?.email ?? null);

    return {
      id: profile.id,
      full_name: profile.full_name,
      mobile: profile.mobile,
      job_title: profile.job_title ?? "",
      specialty: profile.specialty ?? "",
      region: profile.region ?? "",
      username: displayUser,
      permissions: profile.permissions ?? {},
      role: profile.role,
      email,
      account_status: accountStatus,
      zones: zoneMap.get(profile.id) ?? [],
    };
  });
}

export async function GET(request: Request) {
  const access = await requireManageUsers();
  if (!access.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: access.status });
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number.parseInt(searchParams.get("page") || "1", 10) || 1);
  const rawLimit = Number.parseInt(searchParams.get("limit") || "20", 10);
  const limit = Math.min(100, Math.max(1, Number.isFinite(rawLimit) ? rawLimit : 20));
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const qRaw = searchParams.get("q")?.trim() ?? "";
  const roleFilter = searchParams.get("role")?.trim() ?? "";
  const zoneIdFilter = searchParams.get("zoneId")?.trim() ?? "";
  const statusFilter = searchParams.get("status")?.trim() ?? "";

  try {
    const adminSupabase = createSupabaseAdminClient();

    const { data: zones } = await adminSupabase.from("zones").select("id, name").order("name");

    const applyCommonFilters = () => {
      let q = adminSupabase
        .from("profiles")
        .select(PROFILE_SELECT, { count: "exact" })
        .order("full_name", { ascending: true });
      if (qRaw) {
        const safe = qRaw.replace(/,/g, " ");
        q = q.or(`full_name.ilike.%${safe}%,mobile.ilike.%${safe}%`);
      }
      if (roleFilter && roleFilter !== "all") {
        q = q.eq("role", roleFilter as ProfileRow["role"]);
      }
      return q;
    };

    let profileQuery = applyCommonFilters();

    if (zoneIdFilter && zoneIdFilter !== "all") {
      const { data: zpRows, error: zpErr } = await adminSupabase
        .from("zone_profiles")
        .select("profile_id")
        .eq("zone_id", zoneIdFilter);
      if (zpErr) {
        return NextResponse.json({ error: zpErr.message }, { status: 400 });
      }
      const ids = [...new Set((zpRows ?? []).map((r) => r.profile_id))];
      if (ids.length === 0) {
        return NextResponse.json({
          users: [],
          zones: zones ?? [],
          total: 0,
          page,
          pageSize: limit,
        });
      }
      profileQuery = profileQuery.in("id", ids);
    }

    const needsAuthStatusSlice =
      statusFilter === "active" || statusFilter === "inactive";

    if (needsAuthStatusSlice) {
      const { data: allProfiles, error: fetchErr } = await profileQuery.limit(2000);
      if (fetchErr) {
        return NextResponse.json({ error: fetchErr.message }, { status: 400 });
      }
      const list = ((allProfiles as ProfileRow[]) ?? []) as ProfileRow[];
      const zoneMap = await buildZoneMapForProfiles(
        adminSupabase,
        list.map((p) => p.id),
      );
      const rowsAll = await mapProfilesToUserRows(adminSupabase, list, zoneMap);
      const filtered = rowsAll.filter((r) =>
        statusFilter === "active" ? r.account_status === "نشط" : r.account_status === "بانتظار التفعيل",
      );
      const total = filtered.length;
      const pageSlice = filtered.slice(from, from + limit);
      return NextResponse.json({
        users: pageSlice,
        zones: zones ?? [],
        total,
        page,
        pageSize: limit,
      });
    }

    const { data: profiles, error: profilesError, count } = await profileQuery.range(from, to);

    if (profilesError) {
      return NextResponse.json({ error: profilesError.message }, { status: 400 });
    }

    const list = ((profiles as ProfileRow[]) ?? []) as ProfileRow[];
    const profileIds = list.map((p) => p.id);
    const zoneMap = await buildZoneMapForProfiles(adminSupabase, profileIds);
    const rows = await mapProfilesToUserRows(adminSupabase, list, zoneMap);

    return NextResponse.json({
      users: rows,
      zones: zones ?? [],
      total: count ?? 0,
      page,
      pageSize: limit,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status = message.includes("Missing Supabase admin") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

type InvitePayload = {
  mode?: "invite" | "direct_password";
  /** اسم الدخول الظاهر — يُخزَّن كـ username@… داخلياً */
  username?: string;
  /** قديم: يُفسَّر كجزء محلي فقط */
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
  permissions?: Partial<Record<AppPermissionKey, boolean>>;
};

export async function POST(request: Request) {
  const access = await requireManageUsers();
  if (!access.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: access.status });
  }

  const body = (await request.json()) as InvitePayload;
  const fullName = body.full_name?.trim() ?? "";
  const mobile = body.mobile?.trim() ?? "";
  const jobTitle = body.job_title?.trim() ?? "";
  const specialty = body.specialty ?? "civil";
  const zoneIds = Array.isArray(body.zone_ids) ? body.zone_ids.filter((value) => typeof value === "string") : [];
  const role = body.role ?? "technician";
  const mode = body.mode ?? "direct_password";

  if (mode === "invite") {
    return NextResponse.json(
      { error: "تم إيقاف إرسال الدعوة بالبريد. استخدم إنشاء فوري باسم المستخدم وكلمة المرور." },
      { status: 400 },
    );
  }

  const rawIdentifier = (body.username ?? body.email ?? "").trim();
  const usernameNormalized = parseUsernameOrEmailLocalPart(rawIdentifier);

  if (!usernameNormalized || !fullName || !mobile || !jobTitle || zoneIds.length === 0) {
    return NextResponse.json({ error: "بيانات ناقصة: اسم المستخدم، الاسم، الجوال، المهنة، والمناطق مطلوبة." }, { status: 400 });
  }

  const password = body.password?.trim() ?? "";
  if (password.length < 8) {
    return NextResponse.json({ error: "كلمة المرور يجب أن تكون 8 أحرف على الأقل." }, { status: 400 });
  }

  let authEmail: string;
  try {
    authEmail = toAuthEmail(usernameNormalized);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "اسم المستخدم غير صالح." }, { status: 400 });
  }

  if (isProtectedSuperAdminEmail(authEmail)) {
    return NextResponse.json({ error: "لا يُسمح بإنشاء حساب يطابق المدير المحمي." }, { status: 400 });
  }

  const permissions = mergeInvitePermissions(role, body.permissions);

  try {
    const adminSupabase = createSupabaseAdminClient();

    /** `email_confirm: true` يفعّل البريد فوراً في Auth دون انتظار رابط من المستخدم.
     * إن ظل الدخول يطلب تأكيداً، عطّل في لوحة Supabase: Authentication → Providers → Email → Confirm email. */
    const { data: created, error: createError } = await adminSupabase.auth.admin.createUser({
      email: authEmail,
      password,
      email_confirm: true,
    });

    if (createError) {
      return NextResponse.json({ error: createError.message }, { status: 400 });
    }

    const newUserId = created.user?.id;
    if (!newUserId) {
      return NextResponse.json({ error: "تعذر إنشاء المعرّف." }, { status: 400 });
    }

    const zoneErr = await upsertProfileAndZones(adminSupabase, newUserId, {
      fullName,
      mobile,
      jobTitle,
      specialty,
      role,
      zoneIds,
      permissions,
      username: usernameNormalized,
    });
    if (zoneErr) {
      await adminSupabase.auth.admin.deleteUser(newUserId);
      return NextResponse.json({ error: zoneErr.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status = message.includes("Missing Supabase admin") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
