import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requirePlatformAdmin } from "@/lib/auth-guards";

type InvoiceRow = {
  id: string;
  company_id: string;
  invoice_number: string | null;
  invoice_status: string;
  amount: number | null;
  currency: string | null;
  due_at: string | null;
  issued_at: string | null;
  paid_at: string | null;
  created_at: string;
  companies: { name: string; slug: string } | { name: string; slug: string }[] | null;
};

export async function GET() {
  const access = await requirePlatformAdmin();
  if (!access.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: access.status });
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("company_invoices")
    .select(
      "id, company_id, invoice_number, invoice_status, amount, currency, due_at, issued_at, paid_at, created_at, companies:company_id(name, slug)",
    )
    .order("created_at", { ascending: false })
    .limit(300);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const invoices = ((data ?? []) as InvoiceRow[]).map((row) => ({
    ...row,
    company: Array.isArray(row.companies) ? row.companies[0] : row.companies,
  }));

  return NextResponse.json({ ok: true, invoices });
}
