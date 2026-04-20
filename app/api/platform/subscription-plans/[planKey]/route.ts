import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requirePlatformAdmin } from "@/lib/auth-guards";

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  if (value === null) return {};
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

export async function PATCH(request: Request, context: { params: Promise<{ planKey: string }> }) {
  const access = await requirePlatformAdmin();
  if (!access.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: access.status });
  }

  const { planKey: rawKey } = await context.params;
  const planKey = decodeURIComponent(rawKey ?? "").trim();
  if (!planKey) {
    return NextResponse.json({ error: "missing plan_key" }, { status: 400 });
  }

  const body = (await request.json()) as {
    display_name?: string;
    price_monthly?: number;
    max_technicians?: number | null;
    max_tickets_per_month?: number | null;
    max_zones?: number | null;
    is_active?: boolean;
    features?: unknown;
    limits?: unknown;
  };

  const patch: Record<string, unknown> = {};

  if (body.display_name !== undefined) {
    const name = typeof body.display_name === "string" ? body.display_name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "display_name cannot be empty" }, { status: 400 });
    }
    patch.display_name = name;
  }

  if (body.price_monthly !== undefined) {
    if (typeof body.price_monthly !== "number" || !Number.isFinite(body.price_monthly)) {
      return NextResponse.json({ error: "invalid price_monthly" }, { status: 400 });
    }
    patch.price_monthly = body.price_monthly;
  }

  if (body.max_technicians !== undefined) patch.max_technicians = body.max_technicians;
  if (body.max_tickets_per_month !== undefined) patch.max_tickets_per_month = body.max_tickets_per_month;
  if (body.max_zones !== undefined) patch.max_zones = body.max_zones;
  if (body.is_active !== undefined) patch.is_active = Boolean(body.is_active);

  if (body.features !== undefined) {
    const f = parseJsonObject(body.features);
    if (f === null) {
      return NextResponse.json({ error: "features must be a JSON object" }, { status: 400 });
    }
    patch.features = f;
  }

  if (body.limits !== undefined) {
    const l = parseJsonObject(body.limits);
    if (l === null) {
      return NextResponse.json({ error: "limits must be a JSON object" }, { status: 400 });
    }
    patch.limits = l;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "no fields to update" }, { status: 400 });
  }

  patch.updated_at = new Date().toISOString();

  const admin = createSupabaseAdminClient();
  const { data: updated, error } = await admin
    .from("subscription_plans")
    .update(patch)
    .eq("plan_key", planKey)
    .select("plan_key, display_name, price_monthly, max_technicians, max_tickets_per_month, max_zones, is_active, features, limits, created_at, updated_at")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (!updated) {
    return NextResponse.json({ error: "plan not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, plan: updated });
}

export async function DELETE(_request: Request, context: { params: Promise<{ planKey: string }> }) {
  const access = await requirePlatformAdmin();
  if (!access.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: access.status });
  }

  const { planKey: rawKey } = await context.params;
  const planKey = decodeURIComponent(rawKey ?? "").trim();
  if (!planKey) {
    return NextResponse.json({ error: "missing plan_key" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { count, error: countError } = await admin
    .from("companies")
    .select("id", { count: "exact", head: true })
    .eq("subscription_plan", planKey);

  if (countError) {
    return NextResponse.json({ error: countError.message }, { status: 400 });
  }
  if ((count ?? 0) > 0) {
    return NextResponse.json({ error: "cannot_delete_plan_in_use" }, { status: 409 });
  }

  const { error } = await admin.from("subscription_plans").delete().eq("plan_key", planKey);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
