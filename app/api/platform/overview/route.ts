import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requirePlatformAdmin } from "@/lib/auth-guards";
import { getActivePlatformAdminUserIds } from "@/lib/platform-admin-ids";

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
    const platformAdminIds = new Set(await getActivePlatformAdminUserIds(admin));
    const { data: memberships, error: mErr } = await admin
      .from("company_memberships")
      .select("user_id")
      .in("company_id", companyIds)
      .eq("status", "active");
    if (mErr) {
      return NextResponse.json({ error: mErr.message }, { status: 400 });
    }
    totalActiveMembers = (memberships ?? []).filter((m) => !platformAdminIds.has(m.user_id as string)).length;
  }

  let dueInvoices = 0;
  let overdueInvoices = 0;
  let dueInvoicesAmount = 0;
  if (companyIds.length > 0) {
    const nowIso = new Date().toISOString();
    const { data: invoiceRows, error: invoiceErr } = await admin
      .from("company_invoices")
      .select("invoice_status, amount, due_at")
      .in("company_id", companyIds)
      .in("invoice_status", ["issued", "overdue"]);
    if (invoiceErr) {
      return NextResponse.json({ error: invoiceErr.message }, { status: 400 });
    }
    for (const inv of invoiceRows ?? []) {
      const status = String(inv.invoice_status ?? "");
      if (status === "overdue") {
        overdueInvoices += 1;
      } else if (status === "issued" && inv.due_at && inv.due_at <= nowIso) {
        dueInvoices += 1;
        dueInvoicesAmount += Number(inv.amount ?? 0);
      }
    }
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
      due_invoices: dueInvoices,
      overdue_invoices: overdueInvoices,
      due_invoices_amount: dueInvoicesAmount,
    },
  });
}
