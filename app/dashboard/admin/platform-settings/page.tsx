import { redirect } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/auth-guards";

export default async function PlatformSettingsPage() {
  const access = await requirePlatformAdmin();
  if (!access.ok) {
    redirect("/dashboard");
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-slate-100 p-5" dir="rtl" lang="ar">
      <h1 className="text-xl font-semibold text-slate-900">الإعدادات العالمية</h1>
      <p className="mt-2 text-sm text-slate-600">
        صفحة مخصصة لإعدادات المنصة المركزية (المفاتيح، سياسات الفوترة، وقواعد الدخول العامة). سيتم استكمال
        عناصر التحكم في المرحلة التالية.
      </p>
    </section>
  );
}
