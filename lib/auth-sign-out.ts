import { supabase } from "@/lib/supabase";
import { clearPlatformClientContext } from "@/lib/platform-context";

/**
 * تسجيل خروج من **هذا الجهاز/الجلسة الحالية** فقط.
 * لا يُلغي الجلسات على أجهزة أخرى (عكس signOut بدون scope أو scope: global).
 */
export async function signOutCurrentSessionOnly() {
  clearPlatformClientContext();
  try {
    await fetch("/api/me/reset-context", { method: "POST" });
  } catch {
    // ignore reset failures and continue signout
  }
  const { error } = await supabase.auth.signOut({ scope: "local" });
  clearPlatformClientContext();
  return error;
}
