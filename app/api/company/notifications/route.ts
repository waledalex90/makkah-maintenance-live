import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireManageUsers } from "@/lib/auth-guards";
import { getTenantContext } from "@/lib/tenant-context";

export async function GET() {
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

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("company_notifications")
    .select("id, notification_type, title, body, metadata, is_read, created_at")
    .eq("company_id", tenant.activeCompanyId)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, notifications: data ?? [] });
}

