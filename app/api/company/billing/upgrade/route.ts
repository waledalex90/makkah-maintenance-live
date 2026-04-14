import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireManageUsers } from "@/lib/auth-guards";
import { getTenantContext } from "@/lib/tenant-context";
import { createUpgradeInvoice } from "@/lib/invoicing";

type UpgradePayload = {
  plan_key?: string;
};

export async function POST(request: Request) {
  const access = await requireManageUsers();
  if (!access.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: access.status });
  }

  const tenant = await getTenantContext();
  if (!tenant.ok) {
    return NextResponse.json({ error: tenant.error }, { status: tenant.status });
  }
  if (!tenant.activeCompanyId) {
    return NextResponse.json({ error: "missing_active_company" }, { status: 403 });
  }

  const body = (await request.json()) as UpgradePayload;
  const planKey = body.plan_key?.trim();
  if (!planKey) {
    return NextResponse.json({ error: "plan_key is required" }, { status: 400 });
  }

  try {
    const admin = createSupabaseAdminClient();
    const invoice = await createUpgradeInvoice(admin, {
      companyId: tenant.activeCompanyId,
      planKey,
    });
    return NextResponse.json({ ok: true, invoice });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed creating upgrade invoice" }, { status: 400 });
  }
}

