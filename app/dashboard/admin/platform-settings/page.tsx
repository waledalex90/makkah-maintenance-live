import { redirect } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/auth-guards";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mapRowsToGlobalList } from "@/lib/resolved-settings";
import { PlatformSettingsContent } from "@/components/platform-settings-content";

export default async function PlatformSettingsPage() {
  const access = await requirePlatformAdmin();
  if (!access.ok) {
    redirect("/dashboard");
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("global_settings").select("*").order("category").order("key");

  if (error) {
    return (
      <section className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-800" dir="rtl" lang="ar">
        <p className="font-medium">تعذر تحميل الإعدادات العالمية.</p>
        <p className="mt-1 text-sm">{error.message}</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-slate-50 p-5" dir="rtl" lang="ar">
      <PlatformSettingsContent initialRows={mapRowsToGlobalList(data)} />
    </section>
  );
}
