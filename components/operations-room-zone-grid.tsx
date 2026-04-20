"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CircleAlert, Clock, Cog, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { applyTicketDashboardFilters, type DashboardBaseFilters } from "@/lib/admin-dashboard-filters";
import { arabicErrorMessage } from "@/lib/arabic-errors";
import type { ZoneOpsCounts } from "@/lib/operations-room-utils";
import {
  ZONE_HEAT,
  zoneHeatCardFramePulseClass,
  zoneHeatCardShellClass,
  zoneHeatCardUseLightForeground,
  type ZoneHeatSummary,
} from "@/lib/zone-heat-map";
import { mapLegacyStatus, statusLabelAr } from "@/lib/ticket-status";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";

type Zone = { id: string; name: string };

type DrillTicketRow = {
  id: string;
  ticket_number: number | null;
  external_ticket_number: string | null;
  status: string;
  created_at: string;
  received_at: string | null;
  title: string | null;
};

type OperationsRoomZoneGridProps = {
  zones: Zone[];
  zoneStats: Map<string, ZoneOpsCounts>;
  zoneHeat: Map<string, ZoneHeatSummary>;
  baseFilters: DashboardBaseFilters;
  alertZoneIds: Set<string>;
  loading?: boolean;
  onOpenTicket: (ticketId: string) => void;
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

function emptyHeat(): ZoneHeatSummary {
  return {
    worstRank: 0,
    redBadgeCount: 0,
    yellowBadgeCount: 0,
    pulse: false,
    worstTicketId: null,
    highlightLane: null,
  };
}

function counterHighlightClass(active: boolean, lightFg: boolean): string {
  if (!active) return "";
  return cn(
    "rounded-xl px-2 py-1 shadow-lg",
    lightFg
      ? "bg-white text-slate-900 ring-2 ring-white/90"
      : "bg-white text-slate-900 ring-2 ring-slate-900/15",
  );
}

function ZoneDrilldownSheet(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  zoneId: string | null;
  zoneName: string;
  priorityTicketId: string | null;
  baseFilters: DashboardBaseFilters;
  onOpenTicket: (ticketId: string) => void;
}) {
  const { open, onOpenChange, zoneId, zoneName, priorityTicketId, baseFilters, onOpenTicket } = props;
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!open) setQ("");
  }, [open]);

  const ticketsQuery = useQuery({
    queryKey: ["operations-zone-drilldown", zoneId, baseFilters],
    enabled: open && !!zoneId,
    queryFn: async () => {
      const zid = zoneId!;
      const query = applyTicketDashboardFilters(
        supabase
          .from("tickets")
          .select("id, ticket_number, external_ticket_number, status, created_at, received_at, title")
          .eq("zone_id", zid)
          .or("status.eq.not_received,status.eq.received")
          .order("created_at", { ascending: false })
          .limit(400),
        baseFilters,
      );
      const { data, error } = await query;
      if (error) throw new Error(arabicErrorMessage(error.message));
      return (data ?? []) as DrillTicketRow[];
    },
    staleTime: 15_000,
  });

  const orderedRows = useMemo(() => {
    const rows = ticketsQuery.data ?? [];
    if (!priorityTicketId) return rows;
    const p = rows.find((r) => r.id === priorityTicketId);
    const rest = rows.filter((r) => r.id !== priorityTicketId);
    return p ? [p, ...rest] : rows;
  }, [ticketsQuery.data, priorityTicketId]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    let rows = orderedRows;
    if (t) {
      rows = rows.filter((row) => {
        const num = row.ticket_number != null ? String(row.ticket_number) : "";
        const ext = (row.external_ticket_number ?? "").toLowerCase();
        const title = (row.title ?? "").toLowerCase();
        return num.includes(t) || ext.includes(t) || title.includes(t) || row.id.toLowerCase().includes(t);
      });
    }
    if (!t && priorityTicketId) {
      const p = rows.find((r) => r.id === priorityTicketId);
      const rest = rows.filter((r) => r.id !== priorityTicketId);
      return p ? [p, ...rest] : rows;
    }
    return rows;
  }, [orderedRows, q, priorityTicketId]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        dir="rtl"
        className="left-0 right-auto w-full max-w-lg overflow-y-auto border-l-0 border-r border-slate-200"
      >
        <SheetHeader className="text-right">
          <SheetTitle className="text-right">بلاغات المنطقة</SheetTitle>
          <SheetDescription className="text-right">
            {zoneName} — البلاغ الأكثر خطورة يظهر أولاً ومميزاً عند وجوده.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-3 space-y-2">
          <Input
            dir="rtl"
            placeholder="بحث برقم أو عنوان…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="text-right"
          />
          {ticketsQuery.isPending ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              جاري التحميل…
            </div>
          ) : ticketsQuery.isError ? (
            <p className="text-sm text-red-600">تعذر تحميل البلاغات.</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-slate-500">لا توجد بلاغات مطابقة.</p>
          ) : (
            <ul className="space-y-1.5">
              {filtered.map((row) => {
                const isPriority = priorityTicketId != null && row.id === priorityTicketId;
                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      className={cn(
                        "flex w-full flex-col gap-0.5 rounded-lg border px-3 py-2 text-right text-sm transition",
                        isPriority
                          ? "border-amber-400 bg-amber-50 shadow-md ring-2 ring-amber-200/80 hover:bg-amber-50/90"
                          : "border-slate-200 bg-slate-50/80 hover:bg-white",
                      )}
                      onClick={() => {
                        onOpenTicket(row.id);
                        onOpenChange(false);
                      }}
                    >
                      <span className="font-medium text-slate-900 line-clamp-2">
                        {row.title?.trim() || "بدون عنوان"}
                        {isPriority ? (
                          <span className="mr-2 inline-block rounded bg-amber-200/90 px-1.5 py-0.5 text-[10px] font-semibold text-amber-950">
                            الأكثر خطورة
                          </span>
                        ) : null}
                      </span>
                      <span className="text-[11px] text-slate-500">
                        #{row.external_ticket_number ?? row.ticket_number ?? row.id.slice(0, 8)} ·{" "}
                        {statusLabelAr(mapLegacyStatus(row.status) ?? "not_received")}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function OperationsRoomZoneGrid({
  zones,
  zoneStats,
  zoneHeat,
  baseFilters,
  alertZoneIds,
  loading,
  onOpenTicket,
}: OperationsRoomZoneGridProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetZone, setSheetZone] = useState<{
    id: string;
    name: string;
    priorityTicketId: string | null;
  } | null>(null);

  const sortedZones = useMemo(() => {
    return [...zones].sort((a, b) => {
      const ha = zoneHeat.get(a.id) ?? emptyHeat();
      const hb = zoneHeat.get(b.id) ?? emptyHeat();
      const d = hb.worstRank - ha.worstRank;
      if (d !== 0) return d;
      return a.name.localeCompare(b.name, "ar");
    });
  }, [zones, zoneHeat]);

  const openDrilldown = (zone: Zone, heat: ZoneHeatSummary) => {
    setSheetZone({
      id: zone.id,
      name: zone.name,
      priorityTicketId: heat.worstTicketId,
    });
    setSheetOpen(true);
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
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-900">مصفوفة المناطق</h2>
        <p className="text-[11px] text-slate-500">ترتيب حسب الخطورة — تحديث كل ~45 ثانية</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {sortedZones.map((zone) => {
          const s = zoneStats.get(zone.id) ?? emptyStats();
          const heat = zoneHeat.get(zone.id) ?? emptyHeat();
          const pollingAlert = alertZoneIds.has(zone.id);
          const shellClass = zoneHeatCardShellClass(heat);
          const pulseFrame = zoneHeatCardFramePulseClass(heat);
          const lightFg = zoneHeatCardUseLightForeground(heat);

          const pickupTotal = s.pickup_active + s.pickup_warning + s.pickup_late;
          const completionTotal = s.completion_active + s.completion_warning + s.completion_late;

          const highlightPickup =
            heat.highlightLane === "pickup" && heat.worstRank >= 50 && heat.worstTicketId != null;
          const highlightCompletion =
            heat.highlightLane === "completion" && heat.worstRank >= 50 && heat.worstTicketId != null;

          return (
            <button
              key={zone.id}
              type="button"
              onClick={() => openDrilldown(zone, heat)}
              className="w-full text-right transition hover:opacity-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
            >
              <Card
                className={cn(
                  "relative overflow-hidden border-2 shadow-sm transition-shadow hover:shadow-md",
                  shellClass,
                  pulseFrame,
                )}
              >
                {pollingAlert ? (
                  <span
                    className={cn(
                      "absolute left-3 top-3 z-10 h-2 w-2 rounded-full bg-red-600 shadow-sm",
                      lightFg ? "ring-2 ring-white" : "ring-2 ring-white",
                    )}
                    title="تنبيه مراقبة"
                    aria-hidden
                  />
                ) : null}
                <CardHeader className="space-y-2 pb-2 pt-4">
                  <div className="flex items-start justify-between gap-2 pr-1">
                    <CardTitle
                      className={cn(
                        "text-base font-semibold leading-snug",
                        lightFg ? "text-white" : "text-inherit",
                      )}
                    >
                      {zone.name}
                    </CardTitle>
                    <div className="flex shrink-0 flex-wrap justify-end gap-1">
                      {heat.redBadgeCount > 0 ? (
                        <span
                          className={cn(
                            "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ring-1",
                            lightFg
                              ? "bg-white/20 text-white ring-white/35"
                              : "bg-red-50 text-red-800 ring-red-200/80",
                          )}
                          title="بلاغات خطرة"
                        >
                          <CircleAlert className="h-3 w-3" aria-hidden />
                          {heat.redBadgeCount}
                        </span>
                      ) : null}
                      {heat.yellowBadgeCount > 0 ? (
                        <span
                          className={cn(
                            "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ring-1",
                            lightFg
                              ? "bg-white/20 text-white ring-white/35"
                              : "bg-amber-50 text-amber-900 ring-amber-200/80",
                          )}
                          title="بلاغات أوشكت"
                        >
                          <AlertTriangle className="h-3 w-3" aria-hidden />
                          {heat.yellowBadgeCount}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pb-4 pt-0">
                  <div className="flex items-stretch justify-between gap-3 px-1">
                    <div
                      className={cn(
                        "flex min-w-0 flex-1 items-center justify-center gap-2 rounded-xl py-3",
                        lightFg ? "bg-white/10" : "bg-black/[0.04]",
                        counterHighlightClass(highlightPickup, lightFg),
                      )}
                    >
                      <Clock
                        className={cn(
                          "h-7 w-7 shrink-0",
                          lightFg ? "text-white/90" : "text-slate-500",
                          highlightPickup && "text-slate-700",
                        )}
                        strokeWidth={2}
                        aria-hidden
                      />
                      <span
                        className={cn(
                          "text-2xl font-bold tabular-nums tracking-tight",
                          highlightPickup || !lightFg ? "text-slate-900" : "text-white",
                        )}
                      >
                        {pickupTotal}
                      </span>
                    </div>
                    <div
                      className={cn(
                        "flex min-w-0 flex-1 items-center justify-center gap-2 rounded-xl py-3",
                        lightFg ? "bg-white/10" : "bg-black/[0.04]",
                        counterHighlightClass(highlightCompletion, lightFg),
                      )}
                    >
                      <Cog
                        className={cn(
                          "h-7 w-7 shrink-0",
                          lightFg ? "text-white/90" : "text-slate-500",
                          highlightCompletion && "text-slate-700",
                        )}
                        strokeWidth={2}
                        aria-hidden
                      />
                      <span
                        className={cn(
                          "text-2xl font-bold tabular-nums tracking-tight",
                          highlightCompletion || !lightFg ? "text-slate-900" : "text-white",
                        )}
                      >
                        {completionTotal}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </button>
          );
        })}
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
        استلام: 0–{ZONE_HEAT.pickupSafeMax} د افتراضي · {ZONE_HEAT.pickupSafeMax}–{ZONE_HEAT.pickupWarnMax} د أحمر
        فاتح · ≥{ZONE_HEAT.pickupWarnMax} د أحمر غامق. إنجاز: 0–{ZONE_HEAT.completionSafeMax} د أخضر ·{" "}
        {ZONE_HEAT.completionSafeMax}–{ZONE_HEAT.completionWarnMax} د تدرج · ≥{ZONE_HEAT.completionWarnMax} د خطر
        (نبض على الإطار). العداد المُبرز يشير لمسار أسوأ بلاغ.
      </p>

      <ZoneDrilldownSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        zoneId={sheetZone?.id ?? null}
        zoneName={sheetZone?.name ?? ""}
        priorityTicketId={sheetZone?.priorityTicketId ?? null}
        baseFilters={baseFilters}
        onOpenTicket={onOpenTicket}
      />
    </section>
  );
}
