import { APP_PERMISSION_KEYS, effectivePermissions, type AppPermissionKey } from "@/lib/permissions";

/** دمج صلاحيات الواجهة الافتراضية حسب الدور مع القيم المرسلة من النموذج */
export function mergeInvitePermissions(
  role: Parameters<typeof effectivePermissions>[0],
  partial: Partial<Record<AppPermissionKey, boolean>> | undefined,
): Record<string, unknown> {
  const base = effectivePermissions(role, undefined);
  const out: Record<string, unknown> = { ...base };
  if (!partial) {
    return { ...out, view_admin_reports: out.view_reports };
  }
  for (const key of APP_PERMISSION_KEYS) {
    if (typeof partial[key] === "boolean") {
      out[key] = partial[key];
    }
  }
  if (out.view_reports !== undefined) {
    out.view_admin_reports = out.view_reports;
  }
  return out;
}
