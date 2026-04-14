import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTenantContext } from "@/lib/tenant-context";

export async function GET() {
  const tenant = await getTenantContext();
  if (!tenant.ok) {
    return NextResponse.json({ error: tenant.error }, { status: tenant.status });
  }
  if (!tenant.activeCompanyId) {
    return NextResponse.json({ error: "missing_active_company" }, { status: 403 });
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("company_invoices")
    .select("id, invoice_number, plan_key, amount, currency, invoice_status, period_start, period_end, issued_at, due_at, paid_at, created_at")
    .eq("company_id", tenant.activeCompanyId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, invoices: data ?? [] });
}

