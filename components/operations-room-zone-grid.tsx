"use client";

import { useRouter } from "next/navigation";
import { MapPin } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { buildTicketsFilteredHref, type ZoneOpsCounts } from "@/lib/operations-room-utils";

type Zone = { id: string; name: string };

type OperationsRoomZoneGridProps = {
  zones: Zone[];
  zoneStats: Map<string, ZoneOpsCounts>;
  alertZoneIds: Set<string>;
  loading?: boolean;
};

export function OperationsRoomZoneGrid({ zones, zoneStats, alertZoneIds, loading }: OperationsRoomZoneGridProps) {
  const router = useRouter();

  const go = (href: string) => {
    router.push(href);
  };

  if (loading && zones.length === 0) {
    return (
      <section className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold text-slate-900">مصفوفة المناطق</h2>
        <p className="text-sm text-slate-500">جاري تحميل المناطق…</p>
      </section>
    );
  }

  if (zones.length === 0) {
    return (
      <section className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 p-4 shadow-sm">
        <h2 className="mb-2 text-lg font-semibold text-slate-900">مصفوفة المناطق</h2>
        <p className="text-sm text-slate-600">لا توجد مناطق مُعرّفة. أضف مناطق من إدارة المناطق.</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-900">مصفوفة المناطق</h2>
        <p className="text-xs text-slate-500">انقر على رقم للانتقال إلى البلاغات مع نفس الفلتر</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {zones.map((zone) => {
          const s = zoneStats.get(zone.id) ?? { active: 0, delayed: 0, finished: 0 };
          const showAlert = alertZoneIds.has(zone.id);
          return (
            <Card
              key={zone.id}
              className={cn(
                "relative overflow-hidden border-slate-200 transition-shadow",
                showAlert && "ring-2 ring-red-400/80 shadow-md",
              )}
            >
              {showAlert ? (
                <span
                  className="absolute left-3 top-3 h-2.5 w-2.5 rounded-full bg-red-600 shadow-sm ring-2 ring-white"
                  title="تنبيه مراقبة"
                  aria-hidden
                />
              ) : null}
              <CardHeader className="space-y-1 pb-2">
                <div className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <CardTitle className="text-base leading-snug">{zone.name}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="grid grid-cols-3 gap-2 pt-0 text-center text-sm">
                <div>
                  <p className="text-[10px] font-medium text-slate-500">نشطة</p>
                  <button
                    type="button"
                    className="mt-1 w-full rounded-lg bg-sky-50 py-2 text-lg font-semibold text-sky-900 hover:bg-sky-100"
                    onClick={() => go(buildTicketsFilteredHref({ zoneId: zone.id, statCard: "open" }))}
                  >
                    {s.active}
                  </button>
                </div>
                <div>
                  <p className="text-[10px] font-medium text-slate-500">متأخرة</p>
                  <button
                    type="button"
                    className="mt-1 w-full rounded-lg bg-amber-50 py-2 text-lg font-semibold text-amber-900 hover:bg-amber-100"
                    onClick={() => go(buildTicketsFilteredHref({ zoneId: zone.id, statCard: "late_pickup" }))}
                  >
                    {s.delayed}
                  </button>
                </div>
                <div>
                  <p className="text-[10px] font-medium text-slate-500">منتهية</p>
                  <button
                    type="button"
                    className="mt-1 w-full rounded-lg bg-emerald-50 py-2 text-lg font-semibold text-emerald-900 hover:bg-emerald-100"
                    onClick={() => go(buildTicketsFilteredHref({ zoneId: zone.id, statCard: "finished" }))}
                  >
                    {s.finished}
                  </button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <p className="mt-3 text-[11px] text-slate-500">
        «نشطة» = قيد التنفيذ أو جديد غير متأخر الاستلام؛ «متأخرة» = جديد لم يُستلم بعد أكثر من دقيقتين.
      </p>
    </section>
  );
}
