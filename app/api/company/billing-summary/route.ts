import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTenantContext } from "@/lib/tenant-context";
import { getCompanyBillingSummary } from "@/lib/billing-limits";

export async function GET() {
  const tenant = await getTenantContext();
  if (!tenant.ok) {
    return NextResponse.json({ error: tenant.error }, { status: tenant.status });
  }
  if (!tenant.activeCompanyId) {
    return NextResponse.json({ error: "missing_active_company" }, { status: 403 });
  }

  const admin = createSupabaseAdminClient();
  const summary = await getCompanyBillingSummary(admin, tenant.activeCompanyId);
  if (!summary) {
    return NextResponse.json({ error: "Failed loading billing summary" }, { status: 400 });
  }
  return NextResponse.json({ ok: true, billing: summary });
}

