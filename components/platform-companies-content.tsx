"use client";

import { useQuery } from "@tanstack/react-query";

type CompanyRow = {
  id: string;
  name: string;
  slug: string;
  subscription_plan: string;
  status: string;
  created_at: string;
  active_members: number;
};

export function PlatformCompaniesContent() {
  const query = useQuery({
    queryKey: ["platform-companies"],
    queryFn: async () => {
      const res = await fetch("/api/platform/companies", { cache: "no-store" });
      const json = (await res.json()) as { companies?: CompanyRow[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed loading companies");
      return json.companies ?? [];
    },
    refetchInterval: 20_000,
  });

  const companies = query.data ?? [];

  return (
    <section className="rounded-xl border border-slate-200 bg-slate-100 p-4" dir="rtl" lang="ar">
      <h1 className="text-xl font-semibold text-slate-900">إدارة الشركات</h1>
      <p className="mt-1 text-xs text-slate-600">قائمة الشركات مع إحصائيات سريعة (عدد المستخدمين النشطين).</p>

      <div className="mt-4 overflow-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-[760px] w-full text-right text-sm">
          <thead className="bg-slate-50 text-slate-700">
            <tr>
              <th className="px-3 py-2">الشركة</th>
              <th className="px-3 py-2">Slug</th>
              <th className="px-3 py-2">الباقة</th>
              <th className="px-3 py-2">الحالة</th>
              <th className="px-3 py-2">الأعضاء النشطون</th>
              <th className="px-3 py-2">تاريخ الإنشاء</th>
            </tr>
          </thead>
          <tbody>
            {query.isLoading ? (
              <tr><td className="px-3 py-6 text-center text-slate-500" colSpan={6}>جاري التحميل...</td></tr>
            ) : companies.length === 0 ? (
              <tr><td className="px-3 py-6 text-center text-slate-500" colSpan={6}>لا توجد شركات.</td></tr>
            ) : (
              companies.map((company) => (
                <tr key={company.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium text-slate-900">{company.name}</td>
                  <td className="px-3 py-2 text-xs text-slate-600">{company.slug}</td>
                  <td className="px-3 py-2">{company.subscription_plan}</td>
                  <td className="px-3 py-2">{company.status}</td>
                  <td className="px-3 py-2">{company.active_members}</td>
                  <td className="px-3 py-2 text-xs text-slate-500">{new Date(company.created_at).toLocaleString("ar-SA")}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

