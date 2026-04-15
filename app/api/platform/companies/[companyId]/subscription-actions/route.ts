import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requirePlatformAdmin } from "@/lib/auth-guards";

type ActionPayload = {
  action?: "renew" | "suspend";
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export async function POST(request: Request, context: { params: Promise<{ companyId: string }> }) {
  const access = await requirePlatformAdmin();
  if (!access.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: access.status });
  }

  const { companyId } = await context.params;
  if (!companyId?.trim()) {
    return NextResponse.json({ error: "missing company id" }, { status: 400 });
  }

  const body = (await request.json()) as ActionPayload;
  if (!body.action) {
    return NextResponse.json({ error: "action is required" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: companyRow, error: companyError } = await admin
    .from("companies")
    .select("id, subscription_expires_at")
    .eq("id", companyId)
    .maybeSingle();
  if (companyError) {
    return NextResponse.json({ error: companyError.message }, { status: 400 });
  }
  if (!companyRow) {
    return NextResponse.json({ error: "company not found" }, { status: 404 });
  }

  if (body.action === "suspend") {
    const { data: updated, error: updateError } = await admin
      .from("companies")
      .update({
        status: "suspended",
        subscription_status: "past_due",
      })
      .eq("id", companyId)
      .select("id, status, subscription_status, subscription_expires_at")
      .maybeSingle();
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true, action: "suspend", company: updated });
  }

  if (body.action === "renew") {
    const now = Date.now();
    const base = companyRow.subscription_expires_at
      ? new Date(companyRow.subscription_expires_at).getTime()
      : now;
    const startFrom = Number.isFinite(base) && base > now ? base : now;
    const nextExpiry = new Date(startFrom + 30 * MS_PER_DAY).toISOString();
    const { data: updated, error: updateError } = await admin
      .from("companies")
      .update({
        status: "active",
        subscription_status: "active",
        subscription_expires_at: nextExpiry,
      })
      .eq("id", companyId)
      .select("id, status, subscription_status, subscription_expires_at")
      .maybeSingle();
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true, action: "renew", company: updated });
  }

  return NextResponse.json({ error: "invalid action" }, { status: 400 });
}
