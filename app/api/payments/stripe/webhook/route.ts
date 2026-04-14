import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getStripeServer } from "@/lib/stripe";
import { createCompanyNotification } from "@/lib/invoicing";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: "Missing stripe signature or webhook secret" }, { status: 400 });
  }

  const body = await request.text();
  const stripe = getStripeServer();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (error) {
    return NextResponse.json({ error: `Webhook error: ${error instanceof Error ? error.message : "invalid signature"}` }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const invoiceId = session.metadata?.invoice_id;
    const companyId = session.metadata?.company_id;
    const planKey = session.metadata?.plan_key;
    if (!invoiceId || !companyId || !planKey) {
      return NextResponse.json({ received: true });
    }

    const admin = createSupabaseAdminClient();
    const { data: invoice } = await admin
      .from("company_invoices")
      .select("id, invoice_status, amount")
      .eq("id", invoiceId)
      .eq("company_id", companyId)
      .maybeSingle();

    if (invoice && invoice.invoice_status !== "paid") {
      await admin
        .from("company_invoices")
        .update({
          invoice_status: "paid",
          paid_at: new Date().toISOString(),
          stripe_checkout_session_id: session.id,
          stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null,
          paid_amount: session.amount_total ? session.amount_total / 100 : Number(invoice.amount ?? 0),
          paid_currency: (session.currency ?? "sar").toUpperCase(),
        })
        .eq("id", invoiceId);

      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      await admin
        .from("companies")
        .update({
          subscription_plan: planKey,
          subscription_status: "active",
          subscription_expires_at: expiresAt,
        })
        .eq("id", companyId);

      await createCompanyNotification(admin, {
        companyId,
        type: "invoice_paid",
        title: "تم استلام الدفعة بنجاح",
        body: "تم سداد الفاتورة وتحديث حالة الاشتراك.",
        metadata: { invoice_id: invoiceId, session_id: session.id, plan_key: planKey, expires_at: expiresAt },
      });
    }
  }

  return NextResponse.json({ received: true });
}

