export const PLATFORM_CONTEXT_COOKIE = "platform_active_company_id";
export const PLATFORM_GOD_MODE_COOKIE = "platform_god_mode";

/**
 * يمسح أي سياق شركة محفوظ على جهة العميل.
 * يُستخدم عند Login/Logout وعمليات Reset اليدوية.
 */
export function clearPlatformClientContext() {
  if (typeof window === "undefined") return;

  const keys = [
    "active_company_id",
    "platform_active_company_id",
    "god_mode_company_id",
  ];
  for (const key of keys) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // ignore
    }
    try {
      window.sessionStorage.removeItem(key);
    } catch {
      // ignore
    }
  }

  document.cookie = `${PLATFORM_CONTEXT_COOKIE}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
  document.cookie = `${PLATFORM_GOD_MODE_COOKIE}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
}
