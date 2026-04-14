"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

type SecurityEventRow = {
  id: string;
  event_type: string;
  status_code: number | null;
  message: string;
  actor_email: string | null;
  actor_company_id: string | null;
  created_at: string;
};

export function PlatformMonitoringContent() {
  const query = useQuery({
    queryKey: ["platform-security-events"],
    queryFn: async () => {
      const res = await fetch("/api/platform/security-events?limit=200", { cache: "no-store" });
      const json = (await res.json()) as { events?: SecurityEventRow[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed loading security events");
      return json.events ?? [];
    },
    refetchInterval: 10_000,
  });

  const events = query.data ?? [];
  const metrics = useMemo(() => {
    const rejected = events.filter((e) => e.event_type.includes("reject")).length;
    const code403 = events.filter((e) => e.status_code === 403).length;
    return { rejected, code403, total: events.length };
  }, [events]);

  return (
    <section className="rounded-xl border border-slate-200 bg-slate-100 p-4" dir="rtl" lang="ar">
      <h1 className="text-xl font-semibold text-slate-900">لوحة مراقبة الأمان</h1>
      <p className="mt-1 text-xs text-slate-600">مراقبة لحظية لأخطاء 403 ورفض Tenant Guards.</p>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-3"><p className="text-xs text-slate-500">إجمالي الأحداث</p><p className="text-2xl font-semibold">{metrics.total}</p></div>
        <div className="rounded-lg border border-slate-200 bg-white p-3"><p className="text-xs text-slate-500">Tenant Guard Rejects</p><p className="text-2xl font-semibold text-amber-600">{metrics.rejected}</p></div>
        <div className="rounded-lg border border-slate-200 bg-white p-3"><p className="text-xs text-slate-500">HTTP 403</p><p className="text-2xl font-semibold text-red-600">{metrics.code403}</p></div>
      </div>

      <div className="mt-4 overflow-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-[980px] w-full text-right text-sm">
          <thead className="bg-slate-50 text-slate-700">
            <tr>
              <th className="px-3 py-2">الوقت</th>
              <th className="px-3 py-2">النوع</th>
              <th className="px-3 py-2">HTTP</th>
              <th className="px-3 py-2">الرسالة</th>
              <th className="px-3 py-2">المستخدم</th>
              <th className="px-3 py-2">الشركة</th>
            </tr>
          </thead>
          <tbody>
            {query.isLoading ? (
              <tr><td className="px-3 py-6 text-center text-slate-500" colSpan={6}>جاري التحميل...</td></tr>
            ) : events.length === 0 ? (
              <tr><td className="px-3 py-6 text-center text-slate-500" colSpan={6}>لا توجد أحداث بعد.</td></tr>
            ) : (
              events.map((event) => (
                <tr key={event.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 text-xs text-slate-500">{new Date(event.created_at).toLocaleString("ar-SA")}</td>
                  <td className="px-3 py-2">{event.event_type}</td>
                  <td className="px-3 py-2">{event.status_code ?? "-"}</td>
                  <td className="px-3 py-2">{event.message}</td>
                  <td className="px-3 py-2 text-xs">{event.actor_email ?? "-"}</td>
                  <td className="px-3 py-2 text-xs">{event.actor_company_id ?? "-"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

