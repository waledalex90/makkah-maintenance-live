import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant-context";
import { resolveTicketingSettings } from "@/lib/resolved-settings";

/**
 * إعدادات التذاكر المحلولة (عالمي + override للشركة النشطة) للجلسة الحالية.
 */
export async function GET() {
  const tenant = await getTenantContext();
  if (!tenant.ok) {
    return NextResponse.json({ ok: false, error: tenant.error }, { status: tenant.status });
  }

  const settings = await resolveTicketingSettings(tenant.activeCompanyId);
  return NextResponse.json({ ok: true, settings, company_id: tenant.activeCompanyId });
}
