"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Download, Filter, LayoutDashboard, Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TicketStatus } from "@/lib/ticket-status";
import { statusLabelAr } from "@/lib/ticket-status";
import {
  REPORTS_TICKET_SELECT,
  buildEliteMainDetailsRows,
  computeInsights,
  dailyResponseResolutionSeries,
  distributionByZone,
  technicianPerformance,
  type ReportTicketRow,
} from "@/lib/reports-analytics";
import {
  REPORT_SHEET_IDS,
  REPORT_SHEET_LABELS_AR,
  defaultReportExportSelection,
  downloadPremiumReportsExcel,
  selectedSheetIds,
  type ReportExportMode,
  type ReportExportSelection,
  type ReportSheetId,
} from "@/lib/reports-excel-export";

const ReportsAnalyticsVisuals = dynamic(
  () => import("@/components/reports-analytics-visuals").then((m) => m.ReportsAnalyticsVisuals),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-4">
        <div className="h-28 animate-pulse rounded-2xl border border-slate-700/80 bg-slate-900/60" />
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="h-[320px] animate-pulse rounded-2xl border border-slate-700/80 bg-slate-900/60" />
          <div className="h-[320px] animate-pulse rounded-2xl border border-slate-700/80 bg-slate-900/60" />
        </div>
      </div>
    ),
  },
);

type Filters = {
  dateFrom: string;
  dateTo: string;
  zoneId: string;
  technicianId: string;
  status: TicketStatus | "all";
};

const defaultFilters = (): Filters => ({
  dateFrom: "",
  dateTo: "",
  zoneId: "all",
  technicianId: "all",
  status: "all",
});

function buildTicketsQuery(f: Filters) {
  let q = supabase.from("tickets").select(REPORTS_TICKET_SELECT).order("created_at", { ascending: false }).limit(2500);
  if (f.dateFrom.trim()) {
    q = q.gte("created_at", `${f.dateFrom.trim()}T00:00:00.000+03:00`);
  }
  if (f.dateTo.trim()) {
    q = q.lte("created_at", `${f.dateTo.trim()}T23:59:59.999+03:00`);
  }
  if (f.zoneId !== "all") q = q.eq("zone_id", f.zoneId);
  if (f.technicianId !== "all") {
    q = q.or(
      `assigned_technician_id.eq.${f.technicianId},assigned_engineer_id.eq.${f.technicianId},assigned_supervisor_id.eq.${f.technicianId}`,
    );
  }
  if (f.status !== "all") q = q.eq("status", f.status);
  return q;
}

export function ReportsAnalyticsDashboard() {
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [draft, setDraft] = useState<Filters>(defaultFilters());
  const [exportSelection, setExportSelection] = useState<ReportExportSelection>(() => defaultReportExportSelection());
  const [exportMode, setExportMode] = useState<ReportExportMode>("single_workbook");
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!exportMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) setExportMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [exportMenuOpen]);

  const zonesQuery = useQuery({
    queryKey: ["reports-zones"],
    queryFn: async () => {
      const { data, error } = await supabase.from("zones").select("id, name").order("name");
      if (error) throw new Error(error.message);
      return (data ?? []) as Array<{ id: string; name: string }>;
    },
    staleTime: 60_000,
  });

  const techniciansQuery = useQuery({
    queryKey: ["reports-field-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, role")
        .in("role", ["technician", "engineer", "supervisor"])
        .order("full_name");
      if (error) throw new Error(error.message);
      return (data ?? []) as Array<{ id: string; full_name: string; role: string }>;
    },
    staleTime: 60_000,
  });

  const ticketsQuery = useQuery({
    queryKey: ["reports-analytics-tickets", filters],
    queryFn: async () => {
      const { data, error } = await buildTicketsQuery(filters);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as ReportTicketRow[];
    },
    staleTime: 20_000,
  });

  const rows = ticketsQuery.data ?? [];
  const zoneDist = useMemo(() => distributionByZone(rows), [rows]);
  const techPerf = useMemo(() => technicianPerformance(rows), [rows]);
  const daySeries = useMemo(() => dailyResponseResolutionSeries(rows), [rows]);
  const insights = useMemo(() => computeInsights(rows, techPerf), [rows, techPerf]);

  const chartTechData = useMemo(
    () =>
      techPerf.slice(0, 12).map((t) => ({
        name: t.name.length > 14 ? `${t.name.slice(0, 14)}…` : t.name,
        fullName: t.name,
        count: t.completed,
        avgMin: t.avgResolutionMinutes ?? 0,
      })),
    [techPerf],
  );

  const applyFilters = useCallback(() => {
    setFilters({ ...draft });
  }, [draft]);

  const resetFilters = useCallback(() => {
    const d = defaultFilters();
    setDraft(d);
    setFilters(d);
  }, []);

  const selectedCount = useMemo(() => selectedSheetIds(exportSelection).length, [exportSelection]);

  const toggleExportSheet = useCallback((id: ReportSheetId) => {
    setExportSelection((s) => ({ ...s, [id]: !s[id] }));
  }, []);

  const selectAllExports = useCallback(() => {
    setExportSelection(
      REPORT_SHEET_IDS.reduce((acc, id) => ({ ...acc, [id]: true }), {} as ReportExportSelection),
    );
  }, []);

  const clearExports = useCallback(() => {
    setExportSelection(
      REPORT_SHEET_IDS.reduce((acc, id) => ({ ...acc, [id]: false }), {} as ReportExportSelection),
    );
  }, []);

  const exportExcel = useCallback(() => {
    if (selectedCount === 0) return;
    downloadPremiumReportsExcel(rows, exportSelection, exportMode, {
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
    });
  }, [rows, exportSelection, exportMode, selectedCount, filters.dateFrom, filters.dateTo]);

  const loading = ticketsQuery.isFetching;
  const err = ticketsQuery.error ? (ticketsQuery.error as Error).message : null;
  const previewRows = useMemo(() => buildEliteMainDetailsRows(rows).slice(0, 8), [rows]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 pb-12 pt-6 text-slate-100" dir="rtl" lang="ar">
      <div className="mx-auto max-w-7xl space-y-6 px-4 sm:px-6">
        <header className="flex flex-col gap-4 border-b border-slate-700/60 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              تحليلات مباشرة
            </div>
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
              <LayoutDashboard className="h-8 w-8 text-emerald-400" aria-hidden />
              لوحة تحكم التقارير
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-400">
              مؤشرات الأداء، توزيع الأعطال، وزمن الاستجابة والإصلاح — مع فلاتر وتصدير Excel (مدد بصيغة HH:mm:ss).
            </p>
          </div>
        </header>

        <Card className="border-slate-700/80 bg-slate-900/70 shadow-lg shadow-black/20 backdrop-blur">
          <CardHeader className="border-b border-slate-700/60 pb-3">
            <CardTitle className="text-base text-white">تصدير التقارير</CardTitle>
            <CardDescription className="text-slate-400">
              قائمة منسدلة متعددة الاختيار للتقارير المتاحة، ثم طريقة التصدير. ورقة «كثافة البلاغات الشهرية» تستخدم
              فلتر التاريخ لتمييز أعمدة الجمعة في الشهر المرجعي.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <div ref={exportMenuRef} className="relative max-w-xl">
              <Button
                type="button"
                variant="outline"
                className="flex w-full items-center justify-between border-slate-600 bg-slate-950/80 text-slate-100 hover:bg-slate-800"
                onClick={() => setExportMenuOpen((o) => !o)}
                aria-expanded={exportMenuOpen}
                aria-haspopup="listbox"
              >
                <span>
                  اختيار التقارير
                  {selectedCount > 0 ? (
                    <span className="ms-2 text-emerald-400">({selectedCount} مختار)</span>
                  ) : (
                    <span className="ms-2 text-slate-500">(لا شيء)</span>
                  )}
                </span>
                <ChevronDown className={`size-4 shrink-0 transition-transform ${exportMenuOpen ? "rotate-180" : ""}`} />
              </Button>
              {exportMenuOpen ? (
                <div
                  className="absolute z-50 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-slate-600 bg-slate-950 py-2 shadow-xl shadow-black/40"
                  role="listbox"
                  aria-multiselectable
                >
                  <div className="flex gap-2 border-b border-slate-700 px-3 pb-2">
                    <button
                      type="button"
                      className="text-xs text-emerald-400 hover:underline"
                      onClick={selectAllExports}
                    >
                      تحديد الكل
                    </button>
                    <span className="text-slate-600">|</span>
                    <button type="button" className="text-xs text-slate-400 hover:underline" onClick={clearExports}>
                      إلغاء الكل
                    </button>
                  </div>
                  <ul className="px-1 pt-1">
                    {REPORT_SHEET_IDS.map((id) => (
                      <li key={id}>
                        <label className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-200 hover:bg-slate-800/80">
                          <input
                            type="checkbox"
                            className="size-4 shrink-0 rounded border-slate-500 bg-slate-900 text-emerald-500 focus:ring-emerald-500"
                            checked={exportSelection[id]}
                            onChange={() => toggleExportSheet(id)}
                          />
                          <span>{REPORT_SHEET_LABELS_AR[id]}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
            <fieldset className="space-y-2 rounded-lg border border-slate-700/60 p-3">
              <legend className="px-1 text-xs font-medium text-slate-400">طريقة التصدير</legend>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-200">
                <input
                  type="radio"
                  name="report-export-mode"
                  className="size-4 border-slate-500 text-emerald-500 focus:ring-emerald-500"
                  checked={exportMode === "single_workbook"}
                  onChange={() => setExportMode("single_workbook")}
                />
                ملف Excel واحد يضم الأوراق المختارة فقط (RTL وتنسيق احترافي)
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-200">
                <input
                  type="radio"
                  name="report-export-mode"
                  className="size-4 border-slate-500 text-emerald-500 focus:ring-emerald-500"
                  checked={exportMode === "separate_files"}
                  onChange={() => setExportMode("separate_files")}
                />
                ملف منفصل لكل تقرير مختار (عدة تنزيلات متتابعة)
              </label>
            </fieldset>
            <Button
              type="button"
              variant="outline"
              className="border-emerald-600/50 bg-emerald-950/30 text-emerald-100 hover:bg-emerald-900/40"
              onClick={() => exportExcel()}
              disabled={rows.length === 0 || selectedCount === 0}
            >
              <Download className="ms-2 h-4 w-4" aria-hidden />
              تصدير ({selectedCount} {selectedCount === 1 ? "تقرير" : "تقارير"})
            </Button>
          </CardContent>
        </Card>

        <Card className="border-slate-700/80 bg-slate-900/70 shadow-xl shadow-black/20 backdrop-blur">
          <CardHeader className="border-b border-slate-700/60 pb-4">
            <CardTitle className="flex items-center gap-2 text-lg text-white">
              <Filter className="h-5 w-5 text-sky-400" aria-hidden />
              فلاتر متقدمة
            </CardTitle>
            <CardDescription className="text-slate-400">طبّق الفلتر ثم اضغط «تحديث» لتحديث الرسوم فوراً.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 pt-4 sm:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-2">
              <Label className="text-slate-300">من تاريخ</Label>
              <Input
                type="date"
                className="border-slate-600 bg-slate-950/80 text-slate-100"
                value={draft.dateFrom}
                onChange={(e) => setDraft((d) => ({ ...d, dateFrom: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">إلى تاريخ</Label>
              <Input
                type="date"
                className="border-slate-600 bg-slate-950/80 text-slate-100"
                value={draft.dateTo}
                onChange={(e) => setDraft((d) => ({ ...d, dateTo: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">المنطقة</Label>
              <select
                className="flex h-9 w-full rounded-md border border-slate-600 bg-slate-950/80 px-3 text-sm text-slate-100"
                value={draft.zoneId}
                onChange={(e) => setDraft((d) => ({ ...d, zoneId: e.target.value }))}
              >
                <option value="all">كل المناطق</option>
                {(zonesQuery.data ?? []).map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">الفني / المهندس / المشرف</Label>
              <select
                className="flex h-9 w-full rounded-md border border-slate-600 bg-slate-950/80 px-3 text-sm text-slate-100"
                value={draft.technicianId}
                onChange={(e) => setDraft((d) => ({ ...d, technicianId: e.target.value }))}
              >
                <option value="all">الكل</option>
                {(techniciansQuery.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name} ({p.role})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">الحالة</Label>
              <select
                className="flex h-9 w-full rounded-md border border-slate-600 bg-slate-950/80 px-3 text-sm text-slate-100"
                value={draft.status}
                onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value as Filters["status"] }))}
              >
                <option value="all">كل الحالات</option>
                <option value="not_received">{statusLabelAr("not_received")}</option>
                <option value="received">{statusLabelAr("received")}</option>
                <option value="finished">{statusLabelAr("finished")}</option>
              </select>
            </div>
            <div className="flex flex-wrap items-end gap-2 lg:col-span-5">
              <Button type="button" className="bg-emerald-600 text-white hover:bg-emerald-500" onClick={applyFilters}>
                تحديث البيانات
              </Button>
              <Button
                type="button"
                variant="outline"
                className="border-slate-600 bg-transparent text-slate-300 hover:bg-slate-800 hover:text-white"
                onClick={resetFilters}
              >
                إعادة ضبط
              </Button>
              {loading ? <span className="text-sm text-slate-500">جاري التحميل…</span> : null}
              {err ? <span className="text-sm text-red-400">{err}</span> : null}
              <span className="text-sm text-slate-500">عرض {rows.length} بلاغاً (حد أقصى ٢٥٠٠ للاستعلام)</span>
            </div>
          </CardContent>
        </Card>

        <ReportsAnalyticsVisuals
          insights={insights}
          zoneDist={zoneDist}
          chartTechData={chartTechData}
          daySeries={daySeries}
          previewRows={previewRows}
          rowsCount={rows.length}
        />
      </div>
    </div>
  );
}
