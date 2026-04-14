import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mergeRoleAndUserOverrides, sanitizePermissionPayload } from "@/lib/rbac-roles";
import { effectivePermissions } from "@/lib/permissions";

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

  const { data: platformAdminRow } = await supabase
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

  const activeCompanyId = profile.active_company_id ?? membershipsList[0]?.company_id ?? null;
  const activeMembership = membershipsList.find((m) => m.company_id === activeCompanyId) ?? membershipsList[0] ?? null;

  return NextResponse.json({
    ok: true,
    profile: {
      ...profile,
      active_company_id: activeCompanyId,
    },
    active_company: activeMembership?.company ?? null,
    active_membership: activeMembership,
    memberships: membershipsList,
    is_platform_admin: Boolean(platformAdminRow?.user_id),
  });
}

