"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Clock, MapPin } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { buildTicketsFilteredHref, type ZoneOpsCounts } from "@/lib/operations-room-utils";

type Zone = { id: string; name: string };

type OperationsRoomZoneGridProps = {
  zones: Zone[];
  zoneStats: Map<string, ZoneOpsCounts>;
  alertZoneIds: Set<string>;
  loading?: boolean;
  pickupThresholdMinutes: number;
  completionDeadlineMinutes: number;
  warningRatio: number;
};

function emptyStats(): ZoneOpsCounts {
  return {
    pickup_active: 0,
    pickup_warning: 0,
    pickup_late: 0,
    completion_active: 0,
    completion_warning: 0,
    completion_late: 0,
    finished: 0,
  };
}

/** أولوية العرض: متأخر استلام → متأخر إنجاز → تحذيرات */
function zonePriority(s: ZoneOpsCounts): number {
  if (s.pickup_late > 0) return 8;
  if (s.completion_late > 0) return 7;
  if (s.pickup_warning > 0) return 4;
  if (s.completion_warning > 0) return 3;
  return 0;
}

export function OperationsRoomZoneGrid({
  zones,
  zoneStats,
  alertZoneIds,
  loading,
  pickupThresholdMinutes,
  completionDeadlineMinutes,
  warningRatio,
}: OperationsRoomZoneGridProps) {
  const router = useRouter();

  const sortedZones = useMemo(() => {
    return [...zones].sort((a, b) => {
      const sa = zoneStats.get(a.id) ?? emptyStats();
      const sb = zoneStats.get(b.id) ?? emptyStats();
      const d = zonePriority(sb) - zonePriority(sa);
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
        <p className="text-xs text-slate-500">
          مساران: الاستلام (لم يُستلم) والإنجاز (تم الاستلام) — تتحدث كل ~45 ثانية
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {sortedZones.map((zone) => {
          const s = zoneStats.get(zone.id) ?? emptyStats();
          const pollingAlert = alertZoneIds.has(zone.id);
          const hasPickupLate = s.pickup_late > 0;
          const hasPickupWarn = s.pickup_warning > 0;
          const hasCompLate = s.completion_late > 0;
          const hasCompWarn = s.completion_warning > 0;
          const showCompletionClock = hasCompLate || hasCompWarn;

          /* تدرج أصفر → أحمر داكن لمسار الاستلام عند التأخر */
          const pickupGradient =
            hasPickupLate &&
            "border-red-950 bg-gradient-to-br from-amber-200/95 via-red-800/95 to-red-950 text-white shadow-lg";
          const pickupAmberOnly =
            !hasPickupLate && hasPickupWarn && "border-amber-500 bg-amber-50/95 shadow-sm";
          /* إنجاز: متوهج عند التأخر، برتقالي عند التحذير */
          const completionGlow =
            hasCompLate &&
            "shadow-[0_0_0_2px_rgba(220,38,38,0.9),0_0_26px_rgba(251,146,60,0.65)] ring-2 ring-red-500/90";
          const completionWarnRing =
            !hasCompLate && hasCompWarn && "ring-2 ring-orange-400 shadow-md shadow-orange-200/50";

          return (
            <Card
              key={zone.id}
              className={cn(
                "relative overflow-hidden border-2 transition-colors duration-300",
                pickupGradient || pickupAmberOnly || "border-slate-200 bg-white",
                completionGlow,
                completionWarnRing && !completionGlow,
                !pickupGradient && !pickupAmberOnly && !completionGlow && !completionWarnRing && "border-slate-200",
              )}
            >
              {pollingAlert ? (
                <span
                  className="absolute left-3 top-3 h-2.5 w-2.5 rounded-full bg-red-600 shadow-sm ring-2 ring-white"
                  title="تنبيه مراقبة"
                  aria-hidden
                />
              ) : null}
              {showCompletionClock ? (
                <span
                  className={cn(
                    "absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full",
                    hasCompLate ? "bg-red-600/90 text-white shadow-[0_0_12px_rgba(248,113,113,0.9)]" : "bg-orange-500/90 text-white",
                  )}
                  title="تأخير أو تحذير في التنفيذ (بعد الاستلام)"
                  aria-hidden
                >
                  <Clock className="h-4 w-4" strokeWidth={2.5} />
                </span>
              ) : null}
              <CardHeader className="space-y-1 pb-2">
                <div className="flex items-start gap-2 pr-8">
                  <MapPin
                    className={cn(
                      "mt-0.5 h-4 w-4 shrink-0",
                      hasPickupLate ? "text-red-200" : hasPickupWarn ? "text-amber-700" : hasCompLate ? "text-red-400" : "text-sky-600",
                    )}
                  />
                  <CardTitle className={cn("text-base leading-snug", hasPickupLate && "text-white drop-shadow-sm")}>
                    {zone.name}
                  </CardTitle>
                </div>
                <p className={cn("text-[10px] font-medium", hasPickupLate ? "text-amber-100" : "text-slate-500")}>
                  مسار الاستلام
                </p>
              </CardHeader>
              <CardContent className="grid grid-cols-3 gap-1.5 pt-0">
                <div>
                  <p className={cn("text-[9px] font-medium", hasPickupLate ? "text-amber-100" : "text-slate-500")}>
                    نشطة
                  </p>
                  <button
                    type="button"
                    className={cn(
                      "mt-0.5 w-full rounded-md py-1.5 text-sm font-bold hover:opacity-90",
                      hasPickupLate
                        ? "bg-white/15 text-white"
                        : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100",
                    )}
                    onClick={() => go(buildTicketsFilteredHref({ zoneId: zone.id, statCard: "pickup_open" }))}
                  >
                    {s.pickup_active}
                  </button>
                </div>
                <div>
                  <p className={cn("text-[9px] font-medium", hasPickupLate ? "text-amber-100" : "text-amber-700")}>
                    أوشك
                  </p>
                  <button
                    type="button"
                    className={cn(
                      "mt-0.5 w-full rounded-md py-1.5 text-sm font-bold hover:opacity-90",
                      hasPickupLate ? "bg-amber-500/30 text-white" : "bg-amber-100/90 text-amber-900 hover:bg-amber-200",
                    )}
                    onClick={() => go(buildTicketsFilteredHref({ zoneId: zone.id, statCard: "pickup_warning" }))}
                  >
                    {s.pickup_warning}
                  </button>
                </div>
                <div>
                  <p className={cn("text-[9px] font-medium", hasPickupLate ? "text-red-100" : "text-red-800")}>
                    متأخّر
                  </p>
                  <button
                    type="button"
                    className={cn(
                      "mt-0.5 w-full rounded-md py-1.5 text-base font-black hover:opacity-90",
                      hasPickupLate ? "bg-red-950/80 text-white" : "bg-red-50 text-red-700 hover:bg-red-100",
                    )}
                    onClick={() => go(buildTicketsFilteredHref({ zoneId: zone.id, statCard: "late_pickup" }))}
                  >
                    {s.pickup_late}
                  </button>
                </div>
              </CardContent>

              <div
                className={cn(
                  "border-t px-4 pb-3 pt-2",
                  hasPickupLate ? "border-white/15 bg-black/15" : "border-slate-200/80",
                )}
              >
                <p
                  className={cn(
                    "mb-1.5 text-[10px] font-medium",
                    hasPickupLate ? "text-amber-100/90" : "text-slate-500",
                  )}
                >
                  مسار الإنجاز
                </p>
                <div className="grid grid-cols-3 gap-1.5">
                  <div>
                    <p className={cn("text-[9px]", hasPickupLate ? "text-sky-100" : "text-slate-500")}>قيد التنفيذ</p>
                    <button
                      type="button"
                      className={cn(
                        "mt-0.5 w-full rounded-md py-1.5 text-sm font-bold hover:opacity-95",
                        hasPickupLate
                          ? "bg-sky-500/25 text-white ring-1 ring-white/20"
                          : "bg-sky-50 text-sky-900 hover:bg-sky-100",
                      )}
                      onClick={() => go(buildTicketsFilteredHref({ zoneId: zone.id, statCard: "completion_open" }))}
                    >
                      {s.completion_active}
                    </button>
                  </div>
                  <div>
                    <p
                      className={cn(
                        "text-[8px] font-medium leading-tight",
                        hasPickupLate ? "text-amber-100" : "text-amber-700",
                      )}
                      title="Completion Warning"
                    >
                      إنجاز أوشك على التأخير
                    </p>
                    <button
                      type="button"
                      className={cn(
                        "mt-0.5 w-full rounded-md border py-1.5 text-sm font-bold",
                        hasPickupLate
                          ? "border-amber-300/60 bg-amber-400/25 text-amber-50"
                          : "border-amber-400 bg-gradient-to-b from-amber-100 to-amber-200 text-amber-950 hover:from-amber-50",
                      )}
                      title="Completion Warning"
                      onClick={() => go(buildTicketsFilteredHref({ zoneId: zone.id, statCard: "completion_warning" }))}
                    >
                      {s.completion_warning}
                    </button>
                  </div>
                  <div>
                    <p className={cn("text-[9px] font-medium", hasPickupLate ? "text-orange-200" : "text-red-700")} title="Completion Late">
                      إنجاز متأخر
                    </p>
                    <button
                      type="button"
                      className="mt-0.5 w-full rounded-md bg-gradient-to-br from-orange-500 to-red-600 py-1.5 text-sm font-black text-white shadow-[0_0_16px_rgba(251,146,60,0.85)] hover:brightness-110"
                      title="Completion Late"
                      onClick={() => go(buildTicketsFilteredHref({ zoneId: zone.id, statCard: "completion_late" }))}
                    >
                      {s.completion_late}
                    </button>
                  </div>
                </div>
              </div>

              <div
                className={cn("border-t px-4 pb-3", hasPickupLate ? "border-white/15" : "border-slate-200/80")}
              >
                <p className={cn("mb-1 text-[9px]", hasPickupLate ? "text-amber-100/80" : "text-slate-500")}>منتهية</p>
                <button
                  type="button"
                  className={cn(
                    "w-full rounded-md py-2 text-sm font-semibold",
                    hasPickupLate
                      ? "bg-white/10 text-white hover:bg-white/20"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200",
                  )}
                  onClick={() => go(buildTicketsFilteredHref({ zoneId: zone.id, statCard: "finished" }))}
                >
                  {s.finished}
                </button>
              </div>
            </Card>
          );
        })}
      </div>
      <p className="mt-3 text-[11px] text-slate-500">
        الاستلام: مهلة {pickupThresholdMinutes} دقيقة — «أوشك» بعد {Math.round(warningRatio * 100)}% من المهلة. الإنجاز: مهلة{" "}
        {completionDeadlineMinutes} دقيقة منذ الاستلام — أحمر داكن = تأخير استلام؛ أحمر متوهج وساعة = تأخير إنجاز.
      </p>
    </section>
  );
}
