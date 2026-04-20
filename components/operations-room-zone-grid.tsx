"use client";

import { useMemo } from "react";
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
  /** مهلة الاستلام بالدقائق (للنص التوضيحي) */
  pickupThresholdMinutes: number;
  /** نسبة التحذير 0–1 (مثلاً 0.75 = 75%) */
  warningRatio: number;
};

function emptyStats(): ZoneOpsCounts {
  return { active: 0, warning: 0, late: 0, finished: 0 };
}

export function OperationsRoomZoneGrid({
  zones,
  zoneStats,
  alertZoneIds,
  loading,
  pickupThresholdMinutes,
  warningRatio,
}: OperationsRoomZoneGridProps) {
  const router = useRouter();

  const sortedZones = useMemo(() => {
    return [...zones].sort((a, b) => {
      const sa = zoneStats.get(a.id) ?? emptyStats();
      const sb = zoneStats.get(b.id) ?? emptyStats();
      /** أولوية: متأخرة ثم أوشك على التأخير ثم الباقي أبجدياً */
      const pri = (s: ZoneOpsCounts) => (s.late > 0 ? 4 : s.warning > 0 ? 2 : 0);
      const d = pri(sb) - pri(sa);
      if (d !== 0) return d;
      return a.name.localeCompare(b.name, "ar");
    });
  }, [zones, zoneStats]);

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
        <p className="text-xs text-slate-500">مرتبة حسب الأولوية (متأخرة → أوشك على التأخير) — تتحدث مع المراقبة كل ~45 ثانية</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {sortedZones.map((zone) => {
          const s = zoneStats.get(zone.id) ?? emptyStats();
          const pollingAlert = alertZoneIds.has(zone.id);
          const critical = s.late > 0;
          const warnState = !critical && s.warning > 0;

          return (
            <Card
              key={zone.id}
              className={cn(
                "relative overflow-hidden border-2 transition-colors duration-300",
                critical &&
                  "border-red-500 bg-red-50/95 shadow-md ring-2 ring-red-400/90 animate-pulse [animation-duration:1.8s]",
                warnState && "border-amber-400 bg-amber-50/90 shadow-sm",
                !critical && !warnState && "border-slate-200 bg-white",
              )}
            >
              {pollingAlert ? (
                <span
                  className="absolute left-3 top-3 h-2.5 w-2.5 rounded-full bg-red-600 shadow-sm ring-2 ring-white"
                  title="تنبيه مراقبة"
                  aria-hidden
                />
              ) : null}
              <CardHeader className="space-y-1 pb-2">
                <div className="flex items-start gap-2">
                  <MapPin
                    className={cn(
                      "mt-0.5 h-4 w-4 shrink-0",
                      critical ? "text-red-600" : warnState ? "text-amber-600" : "text-sky-600",
                    )}
                  />
                  <CardTitle className="text-base leading-snug">{zone.name}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-2 pt-0 sm:grid-cols-4">
                <div>
                  <p className="text-[10px] font-medium text-slate-500">نشطة</p>
                  <button
                    type="button"
                    className="mt-1 w-full rounded-lg bg-emerald-50 py-2 text-lg font-bold text-emerald-800 hover:bg-emerald-100"
                    onClick={() => go(buildTicketsFilteredHref({ zoneId: zone.id, statCard: "open" }))}
                  >
                    {s.active}
                  </button>
                </div>
                <div>
                  <p className="text-[10px] font-medium text-amber-700">أوشك على التأخير</p>
                  <button
                    type="button"
                    className="mt-1 w-full rounded-lg bg-amber-100/90 py-2 text-lg font-bold text-amber-800 hover:bg-amber-200"
                    onClick={() => go(buildTicketsFilteredHref({ zoneId: zone.id, statCard: "pickup_warning" }))}
                  >
                    {s.warning}
                  </button>
                </div>
                <div>
                  <p className="text-[10px] font-medium text-red-700">متأخرة</p>
                  <button
                    type="button"
                    className="mt-1 w-full rounded-lg bg-red-50 py-2 text-xl font-black text-red-600 hover:bg-red-100"
                    onClick={() => go(buildTicketsFilteredHref({ zoneId: zone.id, statCard: "late_pickup" }))}
                  >
                    {s.late}
                  </button>
                </div>
                <div>
                  <p className="text-[10px] font-medium text-slate-500">منتهية</p>
                  <button
                    type="button"
                    className="mt-1 w-full rounded-lg bg-slate-100 py-2 text-lg font-semibold text-slate-700 hover:bg-slate-200"
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
        مهلة الاستلام المرجعية: {pickupThresholdMinutes} دقيقة — «أوشك» = مرّ {Math.round(warningRatio * 100)}% من المهلة ولم يُستلم بعد؛ «متأخرة» = تجاوزت المهلة بالكامل.
      </p>
    </section>
  );
}
