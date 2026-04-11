/** حساب المدير المحمي — لا يُعدَّل من قبل الآخرين (واجهة + API + قاعدة البيانات). */
export const PROTECTED_SUPER_ADMIN_EMAIL = "waledalex90@gmail.com";

export function normalizeEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

export function isProtectedSuperAdminEmail(email: string | null | undefined): boolean {
  return normalizeEmail(email) === normalizeEmail(PROTECTED_SUPER_ADMIN_EMAIL);
}

/** إخفاء أزرار التعديل/الحذف في الجدول: صف محمي والمشاهد ليس صاحب الحساب. */
export function shouldHideAdminActionsForProtectedRow(
  targetEmail: string | null | undefined,
  viewerEmail: string | null | undefined,
): boolean {
  if (!isProtectedSuperAdminEmail(targetEmail)) return false;
  return normalizeEmail(viewerEmail) !== normalizeEmail(PROTECTED_SUPER_ADMIN_EMAIL);
}

/**
 * منع تعديل حساب المدير المحمي من قبل أي مستخدم لا يملك نفس البريد.
 * يُستدعى من واجهات API بعد التحقق من الجلسة.
 */
export function denyMutationOfProtectedSuperAdmin(
  targetEmail: string | null | undefined,
  actorEmail: string | null | undefined,
): string | null {
  if (!isProtectedSuperAdminEmail(targetEmail)) return null;
  if (normalizeEmail(actorEmail) === normalizeEmail(PROTECTED_SUPER_ADMIN_EMAIL)) return null;
  return "لا يُسمح بتعديل حساب المدير المحمي إلا من صاحبه.";
}

/** منع حذف الحساب المحمي بالكامل (أي مستخدم). */
export function denyDeleteProtectedSuperAdmin(targetEmail: string | null | undefined): string | null {
  if (isProtectedSuperAdminEmail(targetEmail)) {
    return "لا يمكن حذف حساب المدير المحمي.";
  }
  return null;
}
