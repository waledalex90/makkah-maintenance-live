import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requirePlatformAdmin } from "@/lib/auth-guards";
import { createCompanyNotification } from "@/lib/invoicing";

function hasCronAccess(request: Request) {
  const secret = process.env.BILLING_CRON_SECRET;
  if (!secret) return false;
  const incoming = request.headers.get("x-billing-cron-secret");
  return Boolean(incoming) && incoming === secret;
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

  const { data: companies, error } = await admin
    .from("companies")
    .select("id, name, subscription_status, subscription_expires_at")
    .not("subscription_expires_at", "is", null)
    .lte("subscription_expires_at", soon.toISOString());
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  let notified = 0;
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

  return NextResponse.json({ ok: true, notified });
}

