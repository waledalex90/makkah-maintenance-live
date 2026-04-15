import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { mergeRoleAndUserOverrides, sanitizePermissionPayload } from "@/lib/rbac-roles";
import { effectivePermissions } from "@/lib/permissions";
import { isProtectedSuperAdminEmail } from "@/lib/protected-super-admin";

type MembershipRole = {
  role_key: string;
  display_name: string;
  permissions: Record<string, unknown> | null;
};

type MembershipCompany = {
  id: string;
  name: string;
  slug: string;
  company_logo_url: string | null;
  subscription_plan: string | null;
  status: string | null;
};

type MembershipRow = {
  company_id: string;
  role_id: string | null;
  is_owner: boolean | null;
  roles: MembershipRole | MembershipRole[] | null;
  companies: MembershipCompany | MembershipCompany[] | null;
};

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, full_name, role, role_id, permissions, active_company_id, company_id, roles:role_id(role_key, display_name, permissions)")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !profile) {
    return NextResponse.json({ ok: false, error: "missing_profile" }, { status: 404 });
  }

  const { data: memberships, error: membershipsError } = await supabase
    .from("company_memberships")
    .select("company_id, role_id, status, is_owner, roles:role_id(role_key, display_name, permissions), companies:company_id(id, name, slug, company_logo_url, subscription_plan, status)")
    .eq("user_id", user.id)
    .eq("status", "active");

  if (membershipsError) {
    return NextResponse.json({ ok: false, error: membershipsError.message }, { status: 400 });
  }

  const { data: platformAdminRow, error: platformAdminError } = await supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  const membershipsList = ((memberships ?? []) as MembershipRow[]).map((m) => {
    const roleData = Array.isArray(m.roles) ? m.roles[0] : m.roles;
    const companyData = Array.isArray(m.companies) ? m.companies[0] : m.companies;
    const rolePerms = roleData?.permissions;
    const merged = mergeRoleAndUserOverrides(rolePerms, (profile.permissions as Record<string, unknown> | null) ?? {});
    const normalized = sanitizePermissionPayload(merged);
    const roleKey = roleData?.role_key ?? profile.role;
    return {
      company_id: m.company_id,
      role_id: m.role_id,
      role_key: roleKey,
      role_display_name: roleData?.display_name ?? roleKey,
      effective_permissions: effectivePermissions(roleKey, normalized),
      is_owner: Boolean(m.is_owner),
      company: companyData,
    };
  });

  const isPlatformAdmin = Boolean(platformAdminRow?.user_id) || isProtectedSuperAdminEmail(user.email);

  let activeCompanyId: string | null = profile.active_company_id ?? null;
  if (activeCompanyId === null && membershipsList.length > 0 && !isPlatformAdmin) {
    activeCompanyId = membershipsList[0].company_id;
  }

  let activeMembership =
    activeCompanyId !== null ? (membershipsList.find((m) => m.company_id === activeCompanyId) ?? null) : null;

  if (!activeMembership && activeCompanyId !== null && membershipsList.length > 0 && !isPlatformAdmin) {
    activeMembership = membershipsList[0];
    activeCompanyId = activeMembership.company_id;
  }

  if (isPlatformAdmin && activeCompanyId && !activeMembership) {
    const admin = createSupabaseAdminClient();
    const { data: companyFetch } = await admin
      .from("companies")
      .select("id, name, slug, company_logo_url, subscription_plan, status")
      .eq("id", activeCompanyId)
      .maybeSingle();
    if (companyFetch) {
      activeMembership = {
        company_id: activeCompanyId,
        role_id: profile.role_id,
        role_key: profile.role ?? "admin",
        role_display_name: "دخول من المنصة",
        effective_permissions: effectivePermissions("admin", null),
        is_owner: true,
        company: {
          id: companyFetch.id,
          name: companyFetch.name,
          slug: companyFetch.slug,
          company_logo_url: companyFetch.company_logo_url,
          subscription_plan: companyFetch.subscription_plan,
          status: companyFetch.status,
        },
      };
    }
  }

  let platform_company_options: { id: string; name: string }[] | undefined;
  if (isPlatformAdmin) {
    const admin = createSupabaseAdminClient();
    const { data: rows } = await admin.from("companies").select("id, name").order("name");
    platform_company_options = (rows ?? []).map((r) => ({
      id: r.id as string,
      name: (r.name as string) ?? "",
    }));
  }

  return NextResponse.json({
    ok: true,
    profile: {
      ...profile,
      active_company_id: activeCompanyId,
    },
    active_company: activeMembership?.company ?? null,
    active_membership: activeMembership,
    memberships: membershipsList,
    is_platform_admin: isPlatformAdmin,
    platform_company_options,
  });
}

