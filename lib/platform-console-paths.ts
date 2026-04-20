/**
 * مسارات لوحة تشغيل المنصة (بدون سياق tenant) — يجب أن تبقى متسقة بين
 * middleware و PlatformRootGuard حتى لا يُعاد توجيه السوبر أدمن خطأً عند التنقل.
 */
const PLATFORM_CONSOLE_PREFIXES = [
  "/dashboard/admin/platform",
  "/dashboard/admin/platform-settings",
  "/dashboard/admin/companies",
  "/dashboard/admin/billing",
  "/dashboard/admin/monitoring",
] as const;

export function isPlatformConsolePath(pathname: string): boolean {
  return PLATFORM_CONSOLE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
