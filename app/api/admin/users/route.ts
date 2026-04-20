import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireManageUsers } from "@/lib/auth-guards";
import { mergeExplicitInvitePermissions, mergeInvitePermissions } from "@/lib/dashboard-user-permissions";
import { upsertProfileAndZones } from "@/lib/server/provision-dashboard-user";
import { parseUsernameOrEmailLocalPart, toAuthEmail, displayLoginIdentifier } from "@/lib/username-auth";
import type { AppPermissionKey } from "@/lib/permissions";
import { isProtectedSuperAdminEmail } from "@/lib/protected-super-admin";
import { defaultAccessWorkListForRole } from "@/lib/access-work-list-defaults";
import { isDynamicRolesEnabled } from "@/lib/feature-flags";
import { getTenantContext } from "@/lib/tenant-context";
import { getActivePlatformAdminUserIds } from "@/lib/platform-admin-ids";
import { listVisibleRoles, resolveRoleForTenant } from "@/lib/server/tenant-roles";
import { assertWithinTechnicianLimit } from "@/lib/billing-limits";
import {
  mergeRoleAndUserOverrides,
  roleToPublicOption,
  sanitizePermissionPayload,
  type RoleRow,
} from "@/lib/rbac-roles";

type ProfileRow = {
  id: string;
  full_name: string;
  mobile: string;
  job_title?: string | null;
  specialty?: string | null;
  region?: string | null;
  username?: string | null;
  permissions?: Record<string, unknown> | null;
  access_work_list?: boolean | null;
  company_id?: string | null;
  role_id?: string | null;
  roles?:
    | { display_name?: string | null; role_key?: string | null; permissions?: Record<string, unknown> | null; company_id?: string | null }
    | null;
  role:
    | "admin"
    | "projects_director"
    | "project_manager"
    | "engineer"
    | "supervisor"
    | "technician"
    | "reporter"
    | "data_entry";
};

const PROFILE_SELECT =
  "id, full_name, mobile, role, role_id, company_id, job_title, specialty, region, permissions, username, access_work_list, roles:role_id(display_name, role_key, permissions, company_id)";

async function buildZoneMapForProfiles(
  adminSupabase: ReturnType<typeof createSupabaseAdminClient>,
  profileIds: string[],
  activeCompanyId: string | null,
  isPlatformAdmin: boolean,
): Promise<Map<string, Array<{ id: string; name: string }>>> {
  const zoneMap = new Map<string, Array<{ id: string; name: string }>>();
  if (profileIds.length === 0) return zoneMap;
  const { data: zoneLinks } = await adminSupabase
    .from("zone_profiles")
    .select("profile_id, zones(id, name)")
    .in("profile_id", profileIds)
    .eq("company_id", activeCompanyId ?? "");
  if (isPlatformAdmin && !activeCompanyId) {
    const { data: allZoneLinks } = await adminSupabase
      .from("zone_profiles")
      .select("profile_id, zones(id, name)")
      .in("profile_id", profileIds);
    (allZoneLinks ?? []).forEach((link) => {
      const zone = Array.isArray(link.zones) ? link.zones[0] : link.zones;
      if (!zone) return;
      const current = zoneMap.get(link.profile_id) ?? [];
      current.push({ id: zone.id, name: zone.name });
      zoneMap.set(link.profile_id, current);
    });
    return zoneMap;
  }
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

    const rolePermissions = profile.roles?.permissions ?? {};
    const effective = mergeRoleAndUserOverrides(rolePermissions, profile.permissions ?? {});
    return {
      id: profile.id,
      full_name: profile.full_name,
      mobile: profile.mobile,
      job_title: profile.job_title ?? "",
      specialty: profile.specialty ?? "",
      region: profile.region ?? "",
      username: displayUser,
      permissions: effective,
      role: profile.role,
      role_id: profile.role_id ?? null,
      role_display_name: profile.roles?.display_name ?? profile.role,
      role_key: profile.roles?.role_key ?? profile.role,
      email,
      account_status: accountStatus,
      zones: zoneMap.get(profile.id) ?? [],
      access_work_list: Boolean(profile.access_work_list),
    };
  });
}

export async function GET() {
  const access = await requireManageUsers();
  if (!access.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: access.status });
  }

  try {
    const tenant = await getTenantContext();
    if (!tenant.ok) {
      return NextResponse.json({ error: tenant.error }, { status: tenant.status });
    }

    const adminSupabase = createSupabaseAdminClient();
    let zonesQuery = adminSupabase.from("zones").select("id, name").order("name");
    if (!tenant.isPlatformAdmin || tenant.activeCompanyId) {
      zonesQuery = zonesQuery.eq("company_id", tenant.activeCompanyId ?? "");
    }
    const { data: zones } = await zonesQuery;
    const { data: rolesData, error: rolesError } = await listVisibleRoles(adminSupabase, tenant.activeCompanyId);
    if (rolesError) {
      return NextResponse.json({ error: rolesError }, { status: 400 });
    }

    let profilesQuery = adminSupabase
      .from("profiles")
      .select(PROFILE_SELECT)
      .order("full_name", { ascending: true })
      .limit(8000);
    if (!tenant.isPlatformAdmin || tenant.activeCompanyId) {
      profilesQuery = profilesQuery.eq("company_id", tenant.activeCompanyId ?? "");
    }
    const { data: profiles, error: profilesError } = await profilesQuery;

    if (profilesError) {
      return NextResponse.json({ error: profilesError.message }, { status: 400 });
    }

    const platformAdminIds = new Set(await getActivePlatformAdminUserIds(adminSupabase));
    const list = (((profiles as ProfileRow[]) ?? []) as ProfileRow[]).filter((p) => !platformAdminIds.has(p.id));
    const profileIds = list.map((p) => p.id);
    const zoneMap = await buildZoneMapForProfiles(adminSupabase, profileIds, tenant.activeCompanyId, tenant.isPlatformAdmin);
    const rows = await mapProfilesToUserRows(adminSupabase, list, zoneMap);

    return NextResponse.json({
      users: rows,
      zones: zones ?? [],
      roles: ((rolesData as RoleRow[] | null) ?? []).map(roleToPublicOption),
      role_lifecycle_enabled: isDynamicRolesEnabled(),
      total: rows.length,
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
  role?: string;
  role_id?: string;
  role_key?: string;
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
  const roleInput = body.role_id?.trim() || body.role_key?.trim() || body.role?.trim() || "technician";
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

  const adminSupabase = createSupabaseAdminClient();
  const tenant = await getTenantContext();
  if (!tenant.ok) {
    return NextResponse.json({ error: tenant.error }, { status: tenant.status });
  }
  if (!tenant.activeCompanyId) {
    return NextResponse.json({ error: "missing_active_company" }, { status: 403 });
  }
  const activeCompanyId = tenant.activeCompanyId;
  const dynamicEnabled = isDynamicRolesEnabled();
  const { role: resolvedRole, error: roleError } = await resolveRoleForTenant(adminSupabase, roleInput, activeCompanyId);
  if (roleError) {
    return NextResponse.json({ error: roleError }, { status: 400 });
  }
  const roleRow = resolvedRole as RoleRow | null;
  if (!roleRow) {
    return NextResponse.json({ error: "دور غير صالح." }, { status: 400 });
  }
  const legacyRole = roleRow.legacy_role ?? "technician";
  if (["technician", "engineer", "supervisor"].includes(legacyRole)) {
    const limitCheck = await assertWithinTechnicianLimit(adminSupabase, activeCompanyId);
    if (!limitCheck.ok) {
      return NextResponse.json({ error: limitCheck.message }, { status: 409 });
    }
  }
  const rolePermissions = sanitizePermissionPayload(roleRow.permissions);
  const permissionsPatch = mergeExplicitInvitePermissions(body.permissions);
  const effectivePermissions = mergeRoleAndUserOverrides(rolePermissions, permissionsPatch);
  const permissions =
    !dynamicEnabled && legacyRole === "admin" && body.permissions === undefined
      ? mergeInvitePermissions("admin", undefined)
      : { ...effectivePermissions, view_admin_reports: effectivePermissions.view_reports };

  try {
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

    if (activeCompanyId) {
      const { error: membershipError } = await adminSupabase.from("company_memberships").upsert(
        {
          user_id: newUserId,
          company_id: activeCompanyId,
          role_id: roleRow.id,
          status: "active",
          is_owner: false,
        },
        { onConflict: "user_id,company_id" },
      );
      if (membershipError) {
        await adminSupabase.auth.admin.deleteUser(newUserId);
        return NextResponse.json({ error: membershipError.message }, { status: 400 });
      }
    }

    if (zoneIds.length > 0 && activeCompanyId) {
      const { data: tenantZones, error: zoneScopeError } = await adminSupabase
        .from("zones")
        .select("id")
        .eq("company_id", activeCompanyId)
        .in("id", zoneIds);
      if (zoneScopeError) {
        await adminSupabase.auth.admin.deleteUser(newUserId);
        return NextResponse.json({ error: zoneScopeError.message }, { status: 400 });
      }
      const allowed = new Set((tenantZones ?? []).map((z) => z.id as string));
      const hasOutOfScope = zoneIds.some((id) => !allowed.has(id));
      if (hasOutOfScope) {
        await adminSupabase.auth.admin.deleteUser(newUserId);
        return NextResponse.json({ error: "zone_ids خارج نطاق الشركة النشطة." }, { status: 403 });
      }
    }

    const zoneErr = await upsertProfileAndZones(adminSupabase, newUserId, {
      fullName,
      mobile,
      jobTitle,
      specialty,
      role: legacyRole,
      roleId: roleRow.id,
      zoneIds,
      permissions,
      username: usernameNormalized,
      access_work_list: defaultAccessWorkListForRole(legacyRole),
      companyId: activeCompanyId,
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
