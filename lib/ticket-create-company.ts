import type { SupabaseClient } from "@supabase/supabase-js";

/** شركة المنطقة المختارة — مطابقة لـ RLS و foreign keys عند إنشاء بلاغ */
export async function companyIdFromZoneId(
  supabase: SupabaseClient,
  zoneId: string,
): Promise<{ companyId: string | null; error: string | null }> {
  const { data, error } = await supabase.from("zones").select("company_id").eq("id", zoneId).maybeSingle();
  if (error) return { companyId: null, error: error.message };
  const cid = (data as { company_id: string | null } | null)?.company_id ?? null;
  return { companyId: cid, error: null };
}
