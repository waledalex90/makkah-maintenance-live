import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requirePlatformAdmin } from "@/lib/auth-guards";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { recordSecurityEvent } from "@/lib/security-events";
import { normalizeBrandHex } from "@/lib/upflow-brand";

const COMPANY_STATUSES = new Set(["active", "trial", "suspended", "cancelled"]);
const SUB_STATUSES = new Set(["active", "past_due", "expired", "trial", "cancelled"]);

type PatchBody = {
  name?: string;
  subscription_plan?: string;
  status?: string;
  subscription_status?: string;
  subscription_expires_at?: string | null;
  billing_email?: string | null;
  branding_primary_hex?: string | null;
  branding_accent_hex?: string | null;
};

export async function PATCH(request: Request, context: { params: Promise<{ companyId: string }> }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const access = await requirePlatformAdmin();
  if (!access.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: access.status });
  }

  const { companyId } = await context.params;
  if (!companyId?.trim()) {
    return NextResponse.json({ error: "missing company id" }, { status: 400 });
  }

  const body = (await request.json()) as PatchBody;
  const patch: Record<string, unknown> = {};
  const admin = createSupabaseAdminClient();

  if (body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
    }
    patch.name = name;
  }

  if (body.subscription_plan !== undefined) {
    const plan = typeof body.subscription_plan === "string" ? body.subscription_plan.trim() : "";
    if (!plan) {
      return NextResponse.json({ error: "subscription_plan invalid" }, { status: 400 });
    }
    const { data: planRow } = await admin.from("subscription_plans").select("plan_key").eq("plan_key", plan).maybeSingle();
    if (!planRow) {
      return NextResponse.json({ error: "unknown subscription_plan" }, { status: 400 });
    }
    patch.subscription_plan = plan;
  }

  if (body.status !== undefined) {
    if (typeof body.status !== "string" || !COMPANY_STATUSES.has(body.status)) {
      return NextResponse.json({ error: "invalid status" }, { status: 400 });
    }
    patch.status = body.status;
  }

  if (body.subscription_status !== undefined) {
    if (typeof body.subscription_status !== "string" || !SUB_STATUSES.has(body.subscription_status)) {
      return NextResponse.json({ error: "invalid subscription_status" }, { status: 400 });
    }
    patch.subscription_status = body.subscription_status;
  }

  if (body.subscription_expires_at !== undefined) {
    if (body.subscription_expires_at === null || body.subscription_expires_at === "") {
      patch.subscription_expires_at = null;
    } else if (typeof body.subscription_expires_at === "string") {
      const d = new Date(body.subscription_expires_at);
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json({ error: "invalid subscription_expires_at" }, { status: 400 });
      }
      patch.subscription_expires_at = d.toISOString();
    } else {
      return NextResponse.json({ error: "invalid subscription_expires_at" }, { status: 400 });
    }
  }

  if (body.billing_email !== undefined) {
    if (body.billing_email === null || body.billing_email === "") {
      patch.billing_email = null;
    } else if (typeof body.billing_email === "string" && body.billing_email.includes("@")) {
      patch.billing_email = body.billing_email.trim();
    } else {
      return NextResponse.json({ error: "invalid billing_email" }, { status: 400 });
    }
  }

  if (body.branding_primary_hex !== undefined) {
    if (body.branding_primary_hex === null || body.branding_primary_hex === "") {
      patch.branding_primary_hex = null;
    } else if (typeof body.branding_primary_hex === "string") {
      const n = normalizeBrandHex(body.branding_primary_hex);
      if (!n) return NextResponse.json({ error: "invalid branding_primary_hex" }, { status: 400 });
      patch.branding_primary_hex = n;
    } else {
      return NextResponse.json({ error: "invalid branding_primary_hex" }, { status: 400 });
    }
  }

  if (body.branding_accent_hex !== undefined) {
    if (body.branding_accent_hex === null || body.branding_accent_hex === "") {
      patch.branding_accent_hex = null;
    } else if (typeof body.branding_accent_hex === "string") {
      const n = normalizeBrandHex(body.branding_accent_hex);
      if (!n) return NextResponse.json({ error: "invalid branding_accent_hex" }, { status: 400 });
      patch.branding_accent_hex = n;
    } else {
      return NextResponse.json({ error: "invalid branding_accent_hex" }, { status: 400 });
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "no fields to update" }, { status: 400 });
  }

  const { data: updated, error } = await admin
    .from("companies")
    .update(patch)
    .eq("id", companyId)
    .select(
      "id, name, slug, subscription_plan, status, subscription_status, subscription_expires_at, billing_email, branding_primary_hex, branding_accent_hex, created_at",
    )
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (!updated) {
    return NextResponse.json({ error: "company not found" }, { status: 404 });
  }

  await recordSecurityEvent({
    event_type: "platform_company_update",
    status_code: 200,
    message: "Platform admin updated company profile/billing fields.",
    actor_user_id: user?.id ?? null,
    actor_email: user?.email ?? null,
    actor_company_id: companyId,
    metadata: { source: "platform/companies/[companyId]", patch_keys: Object.keys(patch) },
  });

  return NextResponse.json({ ok: true, company: updated });
}
