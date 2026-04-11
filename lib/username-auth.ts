/** نطاق وهمي لـ Supabase Auth (يتطلب صيغة بريد إلكتروني) */
export const AUTH_EMAIL_DOMAIN = "makkah.sys";

/** تنقية اسم المستخدم للتخزين ولمطابقة الدخول */
export function normalizeUsername(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9._-]/g, "");
}

/**
 * إن أدخل المستخدم بريداً قديماً بالخطأ، نأخذ الجزء قبل @.
 */
export function parseUsernameOrEmailLocalPart(raw: string): string {
  const t = raw.trim();
  if (t.includes("@")) {
    const local = t.split("@")[0] ?? "";
    return normalizeUsername(local);
  }
  return normalizeUsername(t);
}

export function toAuthEmail(username: string): string {
  const u = normalizeUsername(username);
  if (!u) {
    throw new Error("اسم المستخدم فارغ أو غير صالح.");
  }
  return `${u}@${AUTH_EMAIL_DOMAIN}`;
}

/** عرض ودّي: اسم المستخدم الظاهر بدل البريد الاصطناعي */
export function displayLoginIdentifier(email: string | null | undefined, profileUsername?: string | null): string {
  if (profileUsername?.trim()) return profileUsername.trim();
  if (!email) return "";
  const lower = email.toLowerCase();
  if (lower.endsWith(`@${AUTH_EMAIL_DOMAIN}`)) {
    return email.slice(0, email.length - (`@${AUTH_EMAIL_DOMAIN}`).length);
  }
  return email;
}
