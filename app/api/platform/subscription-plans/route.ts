import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requirePlatformAdmin } from "@/lib/auth-guards";

export async function GET() {
  const access = await requirePlatformAdmin();
  if (!access.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: access.status });
  }

  const admin = createSupabaseAdminClient();
  const { data: plans, error } = await admin
    .from("subscription_plans")
    .select("plan_key, display_name, price_monthly, is_active")
    .eq("is_active", true)
    .order("plan_key");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ plans: plans ?? [] });
}
