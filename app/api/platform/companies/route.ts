import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requirePlatformAdmin } from "@/lib/auth-guards";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { recordSecurityEvent } from "@/lib/security-events";

const COMPANY_STATUSES = new Set(["active", "trial", "suspended", "cancelled"]);
const SUB_STATUSES = new Set(["active", "past_due", "expired", "trial", "cancelled"]);

function slugifyForCompany(input: string): string {
  const s = input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return s.slice(0, 64);
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const access = await requirePlatformAdmin();
  if (!access.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: access.status });
  }

  const body = (await request.json()) as {
    name?: string;
    slug?: string | null;
    subscription_plan?: string;
    status?: string;
    subscription_status?: string;
    billing_email?: string | null;
  };

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  let slug = typeof body.slug === "string" ? slugifyForCompany(body.slug) : "";
  if (!slug) {
    slug = slugifyForCompany(name);
  }
  if (!slug) {
    slug = `co-${Date.now().toString(36)}`;
  }

  const plan = typeof body.subscription_plan === "string" ? body.subscription_plan.trim() : "basic";
  const status =
    typeof body.status === "string" && COMPANY_STATUSES.has(body.status) ? body.status : "trial";
  const subscriptionStatus =
    typeof body.subscription_status === "string" && SUB_STATUSES.has(body.subscription_status)
      ? body.subscription_status
      : "trial";

  let billingEmail: string | null = null;
  if (body.billing_email !== undefined && body.billing_email !== null && body.billing_email !== "") {
    if (typeof body.billing_email === "string" && body.billing_email.includes("@")) {
      billingEmail = body.billing_email.trim();
    } else {
      return NextResponse.json({ error: "invalid billing_email" }, { status: 400 });
    }
  }

  const admin = createSupabaseAdminClient();
  const { data: planRow } = await admin.from("subscription_plans").select("plan_key").eq("plan_key", plan).maybeSingle();
  if (!planRow) {
    return NextResponse.json({ error: "unknown subscription_plan" }, { status: 400 });
  }

  for (let attempt = 0; attempt < 12; attempt++) {
    const trySlug = attempt === 0 ? slug : `${slug}-${attempt}`;
    const { data: created, error } = await admin
      .from("companies")
      .insert({
        name,
        slug: trySlug,
        subscription_plan: plan,
        status,
        subscription_status: subscriptionStatus,
        billing_email: billingEmail,
      })
      .select("id, name, slug, subscription_plan, status, subscription_status, subscription_expires_at, billing_email, created_at")
      .maybeSingle();

    if (!error && created) {
      await recordSecurityEvent({
        event_type: "platform_company_create",
        status_code: 200,
        message: "Platform admin created company.",
        actor_user_id: user?.id ?? null,
        actor_email: user?.email ?? null,
        actor_company_id: created.id as string,
        metadata: { source: "platform/companies", slug: trySlug },
      });
      return NextResponse.json({ ok: true, company: created });
    }
    const msg = error?.message ?? "";
    const code = (error as { code?: string })?.code;
    if (code === "23505" || /duplicate|unique/i.test(msg)) {
      continue;
    }
    return NextResponse.json({ error: error?.message ?? "insert failed" }, { status: 400 });
  }

  return NextResponse.json({ error: "could not allocate unique slug" }, { status: 409 });
}

export async function GET() {
  const access = await requirePlatformAdmin();
  if (!access.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: access.status });
  }

  const admin = createSupabaseAdminClient();
  const { data: companies, error } = await admin
    .from("companies")
    .select(
      "id, name, slug, subscription_plan, status, subscription_status, subscription_expires_at, billing_email, created_at",
    )
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const companyIds = (companies ?? []).map((c) => c.id as string);
  let memberCounts = new Map<string, number>();
  if (companyIds.length > 0) {
    const { data: memberships, error: countError } = await admin
      .from("company_memberships")
      .select("company_id")
      .in("company_id", companyIds)
      .eq("status", "active");
    if (countError) {
      return NextResponse.json({ error: countError.message }, { status: 400 });
    }
    memberCounts = (memberships ?? []).reduce((acc, row) => {
      const companyId = row.company_id as string;
      acc.set(companyId, (acc.get(companyId) ?? 0) + 1);
      return acc;
    }, new Map<string, number>());
  }

  return NextResponse.json({
    companies: (companies ?? []).map((c) => ({
      ...c,
      active_members: memberCounts.get(c.id as string) ?? 0,
    })),
  });
}

