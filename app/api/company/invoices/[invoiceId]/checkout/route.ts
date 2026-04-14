import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireManageUsers } from "@/lib/auth-guards";
import { getTenantContext } from "@/lib/tenant-context";
import { getStripeServer } from "@/lib/stripe";

export async function POST(request: Request, context: { params: Promise<{ invoiceId: string }> }) {
  const access = await requireManageUsers();
  if (!access.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: access.status });
  }

  const tenant = await getTenantContext();
  if (!tenant.ok) {
    return NextResponse.json({ error: tenant.error }, { status: tenant.status });
  }
  if (!tenant.activeCompanyId) {
    return NextResponse.json({ error: "missing_active_company" }, { status: 403 });
  }

  const { invoiceId } = await context.params;
  const admin = createSupabaseAdminClient();
  const { data: invoice, error } = await admin
    .from("company_invoices")
    .select("id, company_id, amount, currency, invoice_status, invoice_number, plan_key")
    .eq("id", invoiceId)
    .eq("company_id", tenant.activeCompanyId)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  }
  if (invoice.invoice_status === "paid") {
    return NextResponse.json({ error: "Invoice already paid." }, { status: 409 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  const stripe = getStripeServer();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    success_url: `${appUrl}/dashboard/settings?billing=success`,
    cancel_url: `${appUrl}/dashboard/settings?billing=cancel`,
    metadata: {
      invoice_id: invoice.id,
      company_id: invoice.company_id,
      plan_key: invoice.plan_key,
    },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: (invoice.currency ?? "SAR").toLowerCase(),
          unit_amount: Math.round(Number(invoice.amount) * 100),
          product_data: {
            name: `Invoice ${invoice.invoice_number ?? invoice.id}`,
            description: `Plan ${invoice.plan_key}`,
          },
        },
      },
    ],
  });

  await admin.from("company_invoices").update({ stripe_checkout_session_id: session.id }).eq("id", invoice.id);
  return NextResponse.json({ ok: true, url: session.url });
}

