import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

function monthKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}${m}`;
}

export function buildInvoiceNumber(companyId: string, date = new Date()) {
  return `INV-${monthKey(date)}-${companyId.slice(0, 8).toUpperCase()}`;
}

export async function createCompanyNotification(
  admin: AdminClient,
  params: {
    companyId: string;
    userId?: string | null;
    type: string;
    title: string;
    body: string;
    metadata?: Record<string, unknown>;
  },
) {
  await admin.from("company_notifications").insert({
    company_id: params.companyId,
    user_id: params.userId ?? null,
    notification_type: params.type,
    title: params.title,
    body: params.body,
    metadata: params.metadata ?? {},
  });
}

export async function generateMonthlyInvoices(admin: AdminClient): Promise<{ generated: number; skipped: number }> {
  const start = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const end = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1);

  const { data: companies, error: companiesError } = await admin
    .from("companies")
    .select("id, name, subscription_plan, subscription_plans:subscription_plan(plan_key, display_name, price_monthly)")
    .in("status", ["active", "trial"]);
  if (companiesError) throw new Error(companiesError.message);

  let generated = 0;
  let skipped = 0;

  for (const company of companies ?? []) {
    const { data: existing } = await admin
      .from("company_invoices")
      .select("id")
      .eq("company_id", company.id)
      .eq("period_start", start.toISOString().slice(0, 10))
      .limit(1)
      .maybeSingle();
    if (existing?.id) {
      skipped += 1;
      continue;
    }
    const plan = Array.isArray(company.subscription_plans) ? company.subscription_plans[0] : company.subscription_plans;
    const amount = Number(plan?.price_monthly ?? 0);
    const { error: invError } = await admin.from("company_invoices").insert({
      company_id: company.id,
      plan_key: company.subscription_plan,
      amount,
      invoice_status: "issued",
      period_start: start.toISOString().slice(0, 10),
      period_end: end.toISOString().slice(0, 10),
      issued_at: new Date().toISOString(),
      due_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      invoice_number: buildInvoiceNumber(company.id),
      metadata: { generation: "month_end" },
    });
    if (invError) throw new Error(invError.message);

    await createCompanyNotification(admin, {
      companyId: company.id as string,
      type: "invoice_issued",
      title: "صدرت فاتورة جديدة",
      body: `تم إصدار فاتورة باقة ${plan?.display_name ?? company.subscription_plan}.`,
      metadata: { month: monthKey(), amount },
    });
    generated += 1;
  }

  return { generated, skipped };
}

export async function createUpgradeInvoice(
  admin: AdminClient,
  params: { companyId: string; planKey: string },
) {
  const { data: plan, error: planError } = await admin
    .from("subscription_plans")
    .select("plan_key, display_name, price_monthly, is_active")
    .eq("plan_key", params.planKey)
    .maybeSingle();
  if (planError) throw new Error(planError.message);
  if (!plan || !plan.is_active) throw new Error("الخطة المطلوبة غير متاحة.");

  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
  const invoiceNumber = `UPG-${monthKey(now)}-${params.companyId.slice(0, 8).toUpperCase()}`;
  const { data: invoice, error: invError } = await admin
    .from("company_invoices")
    .insert({
      company_id: params.companyId,
      plan_key: params.planKey,
      amount: Number(plan.price_monthly ?? 0),
      invoice_status: "issued",
      period_start: now.toISOString().slice(0, 10),
      period_end: end.toISOString().slice(0, 10),
      issued_at: now.toISOString(),
      due_at: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      invoice_number: invoiceNumber,
      metadata: { generation: "upgrade" },
    })
    .select("id, company_id, plan_key, amount, currency, invoice_status, invoice_number")
    .single();
  if (invError) throw new Error(invError.message);

  await createCompanyNotification(admin, {
    companyId: params.companyId,
    type: "invoice_issued",
    title: "فاتورة ترقية جديدة",
    body: `تم إنشاء فاتورة ترقية إلى خطة ${plan.display_name}.`,
    metadata: { invoice_id: invoice.id, plan_key: params.planKey },
  });

  return invoice;
}

