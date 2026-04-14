import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requirePlatformAdmin } from "@/lib/auth-guards";

export async function GET() {
  const access = await requirePlatformAdmin();
  if (!access.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: access.status });
  }

  const admin = createSupabaseAdminClient();
  const { data: companies, error } = await admin
    .from("companies")
    .select("id, name, slug, subscription_plan, status, created_at")
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

