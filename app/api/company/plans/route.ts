import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireManageUsers } from "@/lib/auth-guards";

export async function GET() {
  const access = await requireManageUsers();
  if (!access.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: access.status });
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("subscription_plans")
    .select("plan_key, display_name, price_monthly, max_technicians, max_tickets_per_month, max_zones, features, limits")
    .eq("is_active", true)
    .order("price_monthly", { ascending: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, plans: data ?? [] });
}

