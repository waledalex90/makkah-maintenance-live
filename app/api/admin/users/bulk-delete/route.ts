import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile } from "@/lib/auth-guards";
import { isProtectedSuperAdminEmail } from "@/lib/protected-super-admin";

type Body = { ids?: string[] };

/** حذف جماعي — مسموح فقط لبريد المدير المحمي (Super Admin). */
export async function POST(request: Request) {
  const { user: actor } = await getSessionProfile();
  if (!actor?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isProtectedSuperAdminEmail(actor.email)) {
    return NextResponse.json({ error: "غير مصرح بهذا الإجراء." }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "جسم الطلب غير صالح." }, { status: 400 });
  }

  const rawIds = Array.isArray(body.ids) ? body.ids : [];
  const ids = [...new Set(rawIds.filter((id): id is string => typeof id === "string" && id.length > 0))];
  if (ids.length === 0) {
    return NextResponse.json({ error: "لم يُحدد أي مستخدم." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const deleted: string[] = [];
  const skipped: Array<{ id: string; reason: string }> = [];

  for (const userId of ids) {
    if (userId === actor.id) {
      skipped.push({ id: userId, reason: "لا يمكن حذف حسابك أثناء الجلسة." });
      continue;
    }
    const { data: targetAuth } = await admin.auth.admin.getUserById(userId);
    const email = targetAuth?.user?.email ?? null;
    if (isProtectedSuperAdminEmail(email)) {
      skipped.push({ id: userId, reason: "حساب مدير محمي." });
      continue;
    }
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) {
      skipped.push({ id: userId, reason: error.message });
      continue;
    }
    deleted.push(userId);
  }

  return NextResponse.json({
    ok: skipped.length === 0,
    deleted_count: deleted.length,
    deleted,
    skipped,
  });
}
