import { supabase } from "@/lib/supabase";

/**
 * تسجيل خروج من **هذا الجهاز/الجلسة الحالية** فقط.
 * لا يُلغي الجلسات على أجهزة أخرى (عكس signOut بدون scope أو scope: global).
 */
export async function signOutCurrentSessionOnly() {
  const { error } = await supabase.auth.signOut({ scope: "local" });
  return error;
}
