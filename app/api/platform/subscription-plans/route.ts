import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requirePlatformAdmin } from "@/lib/auth-guards";

const PLAN_KEY_RE = /^[a-z0-9][a-z0-9_-]{0,62}$/;

function parseJsonObject(value: unknown, label: string): Record<string, unknown> | null {
  if (value === undefined || value === null) return {};
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }
  return null;
}

export async function GET(request: NextRequest) {
  const access = await requirePlatformAdmin();
  if (!access.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: access.status });
  }

  const manage = request.nextUrl.searchParams.get("manage") === "1";
  const admin = createSupabaseAdminClient();
  const select = manage
    ? "plan_key, display_name, price_monthly, max_technicians, max_tickets_per_month, max_zones, is_active, features, limits, created_at, updated_at"
    : "plan_key, display_name, price_monthly, is_active";

  let q = admin.from("subscription_plans").select(select).order("plan_key");
  if (!manage) {
    q = q.eq("is_active", true);
  }

  const { data: plans, error } = await q;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ plans: plans ?? [] });
}

export async function POST(request: Request) {
  const access = await requirePlatformAdmin();
  if (!access.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: access.status });
  }

  const body = (await request.json()) as {
    plan_key?: string;
    display_name?: string;
    price_monthly?: number;
    max_technicians?: number | null;
    max_tickets_per_month?: number | null;
    max_zones?: number | null;
    is_active?: boolean;
    features?: unknown;
    limits?: unknown;
  };

  const planKey = typeof body.plan_key === "string" ? body.plan_key.trim().toLowerCase() : "";
  if (!PLAN_KEY_RE.test(planKey)) {
    return NextResponse.json({ error: "invalid plan_key" }, { status: 400 });
  }

  const displayName = typeof body.display_name === "string" ? body.display_name.trim() : "";
  if (!displayName) {
    return NextResponse.json({ error: "display_name is required" }, { status: 400 });
  }

  const priceMonthly =
    typeof body.price_monthly === "number" && Number.isFinite(body.price_monthly) ? body.price_monthly : 0;

  const features = parseJsonObject(body.features, "features");
  const limits = parseJsonObject(body.limits, "limits");
  if (features === null) {
    return NextResponse.json({ error: "features must be a JSON object" }, { status: 400 });
  }
  if (limits === null) {
    return NextResponse.json({ error: "limits must be a JSON object" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: created, error } = await admin
    .from("subscription_plans")
    .insert({
      plan_key: planKey,
      display_name: displayName,
      price_monthly: priceMonthly,
      max_technicians: body.max_technicians ?? null,
      max_tickets_per_month: body.max_tickets_per_month ?? null,
      max_zones: body.max_zones ?? null,
      is_active: body.is_active !== false,
      features,
      limits,
    })
    .select("plan_key, display_name, price_monthly, max_technicians, max_tickets_per_month, max_zones, is_active, features, limits, created_at, updated_at")
    .maybeSingle();

  if (error) {
    const code = (error as { code?: string }).code;
    if (code === "23505") {
      return NextResponse.json({ error: "plan_key already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, plan: created });
}
