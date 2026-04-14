import {
  APP_PERMISSION_KEYS,
  effectivePermissions,
  defaultInvitePermissionToggles,
  sanitizePermissionObject,
  type AppPermissionKey,
} from "@/lib/permissions";

/** سجل JSONB للصلاحيات: يبدأ بكل المفاتيح false ثم يطبّق التعديلات الصريحة فقط (من النموذج أو CSV). */
export function mergeExplicitInvitePermissions(
  partial: Partial<Record<AppPermissionKey, boolean>> | undefined,
): Record<string, unknown> {
  const base = defaultInvitePermissionToggles();
  if (!partial) {
    return { ...base, view_admin_reports: base.view_reports };
  }
  const out: Record<AppPermissionKey, boolean> = { ...base };
  for (const key of APP_PERMISSION_KEYS) {
    if (typeof partial[key] === "boolean") {
      out[key] = partial[key];
    }
  }
  return { ...out, view_admin_reports: out.view_reports };
}

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

/** دمج صلاحيات الدور + تجاوزات المستخدم مع دعم حذف المفتاح بإرسال null. */
export function mergePermissionsWithUnset(
  rolePermissions: Record<string, unknown> | null | undefined,
  currentOverrides: Record<string, unknown> | null | undefined,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const nextOverrides: Record<string, unknown> = { ...(currentOverrides ?? {}) };
  for (const [key, value] of Object.entries(patch)) {
    if (!APP_PERMISSION_KEYS.includes(key as AppPermissionKey)) continue;
    if (value === null) {
      delete nextOverrides[key];
      continue;
    }
    if (typeof value === "boolean") {
      nextOverrides[key] = value;
    }
  }
  const effective = sanitizePermissionObject({ ...(rolePermissions ?? {}), ...nextOverrides });
  return { ...effective, view_admin_reports: effective.view_reports };
}
