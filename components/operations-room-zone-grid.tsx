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
  zoneHeatCardBorderClass,
  zoneHeatStripClass,
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
  return { worstRank: 0, redBadgeCount: 0, yellowBadgeCount: 0, pulse: false };
}

function ZoneDrilldownSheet(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  zoneId: string | null;
  zoneName: string;
  baseFilters: DashboardBaseFilters;
  onOpenTicket: (ticketId: string) => void;
}) {
  const { open, onOpenChange, zoneId, zoneName, baseFilters, onOpenTicket } = props;
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

  const filtered = useMemo(() => {
    const rows = ticketsQuery.data ?? [];
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((row) => {
      const num = row.ticket_number != null ? String(row.ticket_number) : "";
      const ext = (row.external_ticket_number ?? "").toLowerCase();
      const title = (row.title ?? "").toLowerCase();
      return num.includes(t) || ext.includes(t) || title.includes(t) || row.id.toLowerCase().includes(t);
    });
  }, [ticketsQuery.data, q]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        dir="rtl"
        className="left-0 right-auto w-full max-w-lg overflow-y-auto border-l-0 border-r border-slate-200"
      >
        <SheetHeader className="text-right">
          <SheetTitle className="text-right">بلاغات المنطقة</SheetTitle>
          <SheetDescription className="text-right">
            {zoneName} — اضغط على بلاغ لفتح التفاصيل أو استخدم البحث.
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
              {filtered.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    className="flex w-full flex-col gap-0.5 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-right text-sm transition hover:bg-white"
                    onClick={() => {
                      onOpenTicket(row.id);
                      onOpenChange(false);
                    }}
                  >
                    <span className="font-medium text-slate-900 line-clamp-2">
                      {row.title?.trim() || "بدون عنوان"}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      #{row.external_ticket_number ?? row.ticket_number ?? row.id.slice(0, 8)} ·{" "}
                      {statusLabelAr(mapLegacyStatus(row.status) ?? "not_received")}
                    </span>
                  </button>
                </li>
              ))}
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
  const [sheetZone, setSheetZone] = useState<{ id: string; name: string } | null>(null);

  const sortedZones = useMemo(() => {
    return [...zones].sort((a, b) => {
      const ha = zoneHeat.get(a.id) ?? emptyHeat();
      const hb = zoneHeat.get(b.id) ?? emptyHeat();
      const d = hb.worstRank - ha.worstRank;
      if (d !== 0) return d;
      return a.name.localeCompare(b.name, "ar");
    });
  }, [zones, zoneHeat]);

  const openDrilldown = (zone: Zone) => {
    setSheetZone({ id: zone.id, name: zone.name });
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
          const borderClass = zoneHeatCardBorderClass(heat);
          const stripClass = zoneHeatStripClass(heat);

          const pickupTotal = s.pickup_active + s.pickup_warning + s.pickup_late;
          const completionTotal = s.completion_active + s.completion_warning + s.completion_late;

          return (
            <button
              key={zone.id}
              type="button"
              onClick={() => openDrilldown(zone)}
              className="w-full text-right transition hover:opacity-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
            >
              <Card
                className={cn(
                  "relative overflow-hidden border-2 bg-white shadow-sm transition-shadow hover:shadow-md",
                  borderClass,
                )}
              >
                {pollingAlert ? (
                  <span
                    className="absolute left-3 top-3 z-10 h-2 w-2 rounded-full bg-red-600 shadow-sm ring-2 ring-white"
                    title="تنبيه مراقبة"
                    aria-hidden
                  />
                ) : null}
                <CardHeader className="space-y-2 pb-2 pt-4">
                  <div className="flex items-start justify-between gap-2 pr-1">
                    <CardTitle className="text-base font-semibold leading-snug text-slate-900">
                      {zone.name}
                    </CardTitle>
                    <div className="flex shrink-0 flex-wrap justify-end gap-1">
                      {heat.redBadgeCount > 0 ? (
                        <span
                          className="inline-flex items-center gap-0.5 rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-red-800 ring-1 ring-red-200/80"
                          title="بلاغات خطرة"
                        >
                          <CircleAlert className="h-3 w-3" aria-hidden />
                          {heat.redBadgeCount}
                        </span>
                      ) : null}
                      {heat.yellowBadgeCount > 0 ? (
                        <span
                          className="inline-flex items-center gap-0.5 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-amber-900 ring-1 ring-amber-200/80"
                          title="بلاغات أوشكت"
                        >
                          <AlertTriangle className="h-3 w-3" aria-hidden />
                          {heat.yellowBadgeCount}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pb-3 pt-0">
                  <div className="flex items-stretch justify-between gap-3 px-1">
                    <div className="flex min-w-0 flex-1 items-center justify-center gap-2 rounded-lg bg-slate-50/90 py-3">
                      <Clock className="h-7 w-7 shrink-0 text-slate-500" strokeWidth={2} aria-hidden />
                      <span className="text-2xl font-bold tabular-nums tracking-tight text-slate-900">
                        {pickupTotal}
                      </span>
                    </div>
                    <div className="flex min-w-0 flex-1 items-center justify-center gap-2 rounded-lg bg-slate-50/90 py-3">
                      <Cog className="h-7 w-7 shrink-0 text-slate-500" strokeWidth={2} aria-hidden />
                      <span className="text-2xl font-bold tabular-nums tracking-tight text-slate-900">
                        {completionTotal}
                      </span>
                    </div>
                  </div>
                </CardContent>
                <div className={cn("h-2 w-full rounded-b-xl", stripClass)} aria-hidden />
              </Card>
            </button>
          );
        })}
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
        استلام: 0–{ZONE_HEAT.pickupSafeMax} د افتراضي · {ZONE_HEAT.pickupSafeMax}–{ZONE_HEAT.pickupWarnMax} د أحمر
        فاتح · ≥{ZONE_HEAT.pickupWarnMax} د أحمر غامق. إنجاز: 0–{ZONE_HEAT.completionSafeMax} د أخضر ·{" "}
        {ZONE_HEAT.completionSafeMax}–{ZONE_HEAT.completionWarnMax} د تدرج · ≥{ZONE_HEAT.completionWarnMax} د خطر
        (نبض). اللون في الإطار والشريط السفلي فقط.
      </p>

      <ZoneDrilldownSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        zoneId={sheetZone?.id ?? null}
        zoneName={sheetZone?.name ?? ""}
        baseFilters={baseFilters}
        onOpenTicket={onOpenTicket}
      />
    </section>
  );
}
