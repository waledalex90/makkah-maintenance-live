import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requirePlatformAdmin } from "@/lib/auth-guards";

const MS_DAY = 24 * 60 * 60 * 1000;

export async function GET() {
  const access = await requirePlatformAdmin();
  if (!access.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: access.status });
  }

  const admin = createSupabaseAdminClient();
  const { data: companies, error: companiesError } = await admin
    .from("companies")
    .select("id, status, subscription_status, subscription_expires_at");

  if (companiesError) {
    return NextResponse.json({ error: companiesError.message }, { status: 400 });
  }

  const list = companies ?? [];
  const now = Date.now();
  const soon = now + 14 * MS_DAY;

  let activeTenantCount = 0;
  let suspendedCount = 0;
  let expiringWithin14d = 0;
  let subscriptionExpiredCount = 0;

  for (const c of list) {
    if (c.status === "active") activeTenantCount += 1;
    if (c.status === "suspended") suspendedCount += 1;
    if (c.subscription_status === "expired") subscriptionExpiredCount += 1;
    const exp = c.subscription_expires_at ? new Date(c.subscription_expires_at).getTime() : null;
    if (exp !== null && !Number.isNaN(exp) && exp > now && exp <= soon) {
      expiringWithin14d += 1;
    }
  }

  const companyIds = list.map((c) => c.id as string);
  let totalActiveMembers = 0;
  if (companyIds.length > 0) {
    const { data: memberships, error: mErr } = await admin
      .from("company_memberships")
      .select("id")
      .in("company_id", companyIds)
      .eq("status", "active");
    if (mErr) {
      return NextResponse.json({ error: mErr.message }, { status: 400 });
    }
    totalActiveMembers = (memberships ?? []).length;
  }

  return NextResponse.json({
    ok: true,
    totals: {
      companies: list.length,
      active_tenant_status: activeTenantCount,
      suspended_tenants: suspendedCount,
      expiring_subscriptions_14d: expiringWithin14d,
      subscription_status_expired: subscriptionExpiredCount,
      active_members_across_tenants: totalActiveMembers,
    },
  });
}
