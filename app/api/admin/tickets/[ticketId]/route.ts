import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile } from "@/lib/auth-guards";
import { isProtectedSuperAdminEmail } from "@/lib/protected-super-admin";
import { getTenantContext } from "@/lib/tenant-context";

/** حذف بلاغ نهائياً — المدير المحمي بالبريد أو مدير المنصة (Platform Admin) ضمن سياق الشركة. */
export async function DELETE(_request: Request, context: { params: Promise<{ ticketId: string }> }) {
  const { user } = await getSessionProfile();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenant = await getTenantContext();
  if (!tenant.ok) {
    return NextResponse.json({ error: tenant.error }, { status: tenant.status });
  }

  const canDelete =
    isProtectedSuperAdminEmail(user.email) || tenant.isPlatformAdmin;
  if (!canDelete) {
    return NextResponse.json({ error: "غير مصرح بحذف البلاغات." }, { status: 403 });
  }

  const { ticketId } = await context.params;
  if (!ticketId) {
    return NextResponse.json({ error: "معرّف البلاغ مفقود." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  let deleteQuery = admin.from("tickets").delete().eq("id", ticketId);
  if (!tenant.isPlatformAdmin || tenant.activeCompanyId) {
    deleteQuery = deleteQuery.eq("company_id", tenant.activeCompanyId ?? "");
  }

  /** بدون .select() يعيد PostgREST نجاحاً حتى لو حُذف 0 صف (مثلاً بلاغ شركة أخرى). */
  const { data: deletedRows, error } = await deleteQuery.select("id");
  if (error) {
    return NextResponse.json({ error: error.message, ok: false }, { status: 400 });
  }
  const rows = Array.isArray(deletedRows) ? deletedRows : deletedRows ? [deletedRows] : [];
  const deleted = rows.length;
  if (deleted === 0) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "لم يُحذف أي صف: إما أن البلاغ غير موجود أو لا يتبع شركة العمل الحالية (تحقق من سياق الشركة في الشريط العلوي).",
      },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true });
}
