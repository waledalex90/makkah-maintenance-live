import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requirePlatformAdmin } from "@/lib/auth-guards";
import { generateMonthlyInvoices } from "@/lib/invoicing";

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

  try {
    const admin = createSupabaseAdminClient();
    const result = await generateMonthlyInvoices(admin);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed generating invoices" }, { status: 400 });
  }
}

