import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requirePlatformAdmin } from "@/lib/auth-guards";
import { createCompanyNotification, notifyCompanyBillingManagers } from "@/lib/invoicing";

function hasCronAccess(request: Request) {
  const secret = process.env.BILLING_CRON_SECRET;
  const incoming = request.headers.get("x-billing-cron-secret");
  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;
  const bySecret = Boolean(secret) && ((Boolean(incoming) && incoming === secret) || (Boolean(bearer) && bearer === secret));
  const byVercelCron = Boolean(request.headers.get("x-vercel-cron"));
  return bySecret || byVercelCron;
}

export async function POST(request: Request) {
  const cronAccess = hasCronAccess(request);
  if (!cronAccess) {
    const access = await requirePlatformAdmin();
    if (!access.ok) {
      return NextResponse.json({ error: "Unauthorized" }, { status: access.status });
    }
  }

  const admin = createSupabaseAdminClient();
  const now = new Date();
  const soon = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  const overdueCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const { data: companies, error } = await admin
    .from("companies")
    .select("id, name, subscription_status, subscription_expires_at")
    .not("subscription_expires_at", "is", null)
    .lte("subscription_expires_at", soon.toISOString());
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  let notified = 0;
  let overdueInvoices = 0;
  for (const c of companies ?? []) {
    const expiry = c.subscription_expires_at ? new Date(c.subscription_expires_at) : null;
    if (!expiry) continue;
    if (expiry <= now) {
      await admin.from("companies").update({ subscription_status: "expired" }).eq("id", c.id);
      await createCompanyNotification(admin, {
        companyId: c.id as string,
        type: "subscription_expired",
        title: "انتهى الاشتراك",
        body: `انتهت صلاحية الاشتراك في شركة ${c.name}.`,
        metadata: { expires_at: c.subscription_expires_at },
      });
      notified += 1;
      continue;
    }
    await createCompanyNotification(admin, {
      companyId: c.id as string,
      type: "subscription_expiring",
      title: "الاشتراك يقترب من الانتهاء",
      body: `اشتراك الشركة ${c.name} ينتهي قريباً.`,
      metadata: { expires_at: c.subscription_expires_at },
    });
    notified += 1;
  }

  const { data: invoices, error: invoicesError } = await admin
    .from("company_invoices")
    .select("id, company_id, invoice_number, invoice_status, due_at")
    .eq("invoice_status", "issued")
    .not("due_at", "is", null)
    .lte("due_at", overdueCutoff.toISOString());
  if (invoicesError) {
    return NextResponse.json({ error: invoicesError.message }, { status: 400 });
  }

  for (const inv of invoices ?? []) {
    const { error: markError } = await admin
      .from("company_invoices")
      .update({ invoice_status: "overdue" })
      .eq("id", inv.id)
      .eq("invoice_status", "issued");
    if (markError) {
      return NextResponse.json({ error: markError.message }, { status: 400 });
    }

    await notifyCompanyBillingManagers(admin, {
      companyId: inv.company_id as string,
      type: "invoice_overdue",
      title: "فاتورة متأخرة السداد",
      body: `الفاتورة ${inv.invoice_number ?? inv.id} أصبحت متأخرة بعد تجاوز مهلة 24 ساعة من تاريخ الاستحقاق.`,
      metadata: {
        invoice_id: inv.id,
        invoice_number: inv.invoice_number ?? null,
        due_at: inv.due_at ?? null,
      },
    });
    overdueInvoices += 1;
  }

  return NextResponse.json({ ok: true, notified, overdue_invoices: overdueInvoices });
}

