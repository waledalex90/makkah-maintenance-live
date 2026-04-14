import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile } from "@/lib/auth-guards";
import { isProtectedSuperAdminEmail } from "@/lib/protected-super-admin";
import { getTenantContext } from "@/lib/tenant-context";

/** حذف بلاغ نهائياً — مسموح فقط لبريد المدير المحمي (Super Admin). */
export async function DELETE(_request: Request, context: { params: Promise<{ ticketId: string }> }) {
  const { user } = await getSessionProfile();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isProtectedSuperAdminEmail(user.email)) {
    return NextResponse.json({ error: "غير مصرح بحذف البلاغات." }, { status: 403 });
  }

  const { ticketId } = await context.params;
  if (!ticketId) {
    return NextResponse.json({ error: "معرّف البلاغ مفقود." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const tenant = await getTenantContext();
  if (!tenant.ok) {
    return NextResponse.json({ error: tenant.error }, { status: tenant.status });
  }
  let deleteQuery = admin.from("tickets").delete().eq("id", ticketId);
  if (!tenant.isPlatformAdmin || tenant.activeCompanyId) {
    deleteQuery = deleteQuery.eq("company_id", tenant.activeCompanyId ?? "");
  }
  const { error } = await deleteQuery;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
