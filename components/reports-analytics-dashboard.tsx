"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
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

const CHART_ZONE = ["#38bdf8", "#818cf8", "#34d399", "#fbbf24", "#fb7185", "#94a3b8"];

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

        <section className="grid gap-4 md:grid-cols-3">
          <InsightCard
            title="أسرع فني (متوسط إصلاح)"
            value={insights.fastestTech?.name ?? "—"}
            sub={
              insights.fastestTech
                ? `${insights.fastestTech.avgMinutes} دقيقة — ${insights.fastestTech.completed} بلاغ منجز`
                : "لا بيانات كافية (بلاغان منجزان على الأقل لأفضل دقة)"
            }
            accent="from-emerald-500/20 to-teal-500/5"
          />
          <InsightCard
            title="أكثر منطقة أعطالاً"
            value={insights.busiestZone?.name ?? "—"}
            sub={insights.busiestZone ? `${insights.busiestZone.count} بلاغ في النطاق الحالي` : "لا بيانات"}
            accent="from-sky-500/20 to-blue-500/5"
          />
          <InsightCard
            title="أكثر تصنيف تكراراً"
            value={insights.topCategory?.name ?? "—"}
            sub={insights.topCategory ? `${insights.topCategory.count} بلاغ` : "لا بيانات"}
            accent="from-violet-500/20 to-purple-500/5"
          />
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <ChartCard title="توزيع الأعطال حسب المنطقة" description="عدد البلاغات لكل منطقة ضمن الفلاتر الحالية">
            <div dir="ltr" className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={zoneDist} margin={{ top: 8, right: 8, left: 0, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 11 }} angle={-28} textAnchor="end" height={70} />
                  <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8 }}
                    labelStyle={{ color: "#e2e8f0" }}
                  />
                  <Bar dataKey="count" name="العدد" radius={[6, 6, 0, 0]}>
                    {zoneDist.map((_, i) => (
                      <Cell key={i} fill={CHART_ZONE[i % CHART_ZONE.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard title="أداء الفنيين" description="عدد المهام المنجزة + متوسط زمن الإصلاح (دقيقة)">
            <div dir="ltr" className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartTechData} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={80} />
                  <YAxis yAxisId="left" tick={{ fill: "#94a3b8", fontSize: 11 }} allowDecimals={false} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8 }}
                    formatter={(value, name) => {
                      const n = typeof value === "number" ? value : Number(value);
                      const label = name === "count" ? "عدد المهام" : "متوسط الإصلاح (د)";
                      return [Number.isFinite(n) ? n : "—", label];
                    }}
                    labelFormatter={(_, p) => String((p?.[0]?.payload as { fullName?: string })?.fullName ?? "")}
                  />
                  <Legend wrapperStyle={{ color: "#cbd5e1" }} />
                  <Bar yAxisId="left" dataKey="count" fill="#38bdf8" name="عدد المهام" radius={[4, 4, 0, 0]} />
                  <Line yAxisId="right" type="monotone" dataKey="avgMin" stroke="#a78bfa" strokeWidth={2} dot name="متوسط الإصلاح" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </div>

        <ChartCard
          title="زمن الاستجابة وزمن الإصلاح (يومياً)"
          description="متوسط دقائق الاستجابة (إنشاء→استلام) ومتوسط دقائق الإصلاح (استلام→إغلاق) حسب يوم إنشاء البلاغ — توقيت الرياض"
        >
          <div dir="ltr" className="h-[340px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={daySeries} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gResp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#38bdf8" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gRes" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#34d399" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 10 }} />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8 }}
                  formatter={(value, key) => {
                    if (value == null || value === "") return ["—", String(key)];
                    const n = typeof value === "number" ? value : Number(value);
                    const label = key === "avgResponseMin" ? "متوسط الاستجابة" : "متوسط الإصلاح";
                    return [`${Number.isFinite(n) ? n : "—"} د`, label];
                  }}
                />
                <Legend wrapperStyle={{ color: "#cbd5e1" }} />
                <Area type="monotone" dataKey="avgResponseMin" name="متوسط الاستجابة (د)" stroke="#38bdf8" fill="url(#gResp)" connectNulls />
                <Area type="monotone" dataKey="avgResolutionMin" name="متوسط الإصلاح (د)" stroke="#34d399" fill="url(#gRes)" connectNulls />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <Card className="border-slate-700/80 bg-slate-900/50 backdrop-blur">
          <CardHeader>
            <CardTitle className="text-white">معاينة التصدير</CardTitle>
            <CardDescription className="text-slate-400">
              معاينة ورقة التفاصيل الرئيسية؛ أعمدة المدد بصيغة HH:mm:ss. التصدير الفعلي يتبع اختيارك من البطاقة أعلاه.
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="min-w-full text-right text-xs text-slate-200">
              <thead className="border-b border-slate-700 text-slate-400">
                <tr>
                  <th className="px-2 py-2">رقم البلاغ</th>
                  <th className="px-2 py-2">المنطقة</th>
                  <th className="px-2 py-2">الفني</th>
                  <th className="px-2 py-2">التصنيف</th>
                  <th className="px-2 py-2">تاريخ الإنشاء</th>
                  <th className="px-2 py-2">وقت الإنشاء</th>
                  <th className="px-2 py-2">تاريخ الاستلام</th>
                  <th className="px-2 py-2">وقت الاستلام</th>
                  <th className="px-2 py-2">تاريخ الإغلاق</th>
                  <th className="px-2 py-2">وقت الإغلاق</th>
                  <th className="px-2 py-2">عمر العطل (HH:mm:ss)</th>
                  <th className="px-2 py-2">زمن الاستجابة (HH:mm:ss)</th>
                  <th className="px-2 py-2">الحالة النهائية</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((ex, i) => (
                    <tr key={`${ex.ticketNumber}-${i}`} className="border-b border-slate-800/80">
                      <td className="px-2 py-2 font-mono">{ex.ticketNumber}</td>
                      <td className="px-2 py-2">{ex.zone}</td>
                      <td className="px-2 py-2">{ex.technician}</td>
                      <td className="px-2 py-2">{ex.category}</td>
                      <td className="px-2 py-2 whitespace-nowrap">{ex.createDate}</td>
                      <td className="px-2 py-2 whitespace-nowrap">{ex.createTime}</td>
                      <td className="px-2 py-2 whitespace-nowrap">{ex.recvDate}</td>
                      <td className="px-2 py-2 whitespace-nowrap">{ex.recvTime}</td>
                      <td className="px-2 py-2 whitespace-nowrap">{ex.closeDate}</td>
                      <td className="px-2 py-2 whitespace-nowrap">{ex.closeTime}</td>
                      <td className="px-2 py-2">{ex.faultHms}</td>
                      <td className="px-2 py-2">{ex.responseHms}</td>
                      <td className="px-2 py-2 font-medium text-emerald-300/90">{ex.finalStatus}</td>
                    </tr>
                  ))}
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="px-2 py-8 text-center text-slate-500">
                      لا توجد بيانات ضمن الفلاتر.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

const InsightCard = memo(function InsightCard({
  title,
  value,
  sub,
  accent,
}: {
  title: string;
  value: string;
  sub: string;
  accent: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-slate-700/80 bg-gradient-to-br ${accent} p-5 shadow-lg shadow-black/20 backdrop-blur`}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{title}</p>
      <p className="mt-2 text-xl font-bold text-white">{value}</p>
      <p className="mt-1 text-sm text-slate-400">{sub}</p>
    </div>
  );
});

const ChartCard = memo(function ChartCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="border-slate-700/80 bg-slate-900/60 shadow-xl shadow-black/25 backdrop-blur">
      <CardHeader>
        <CardTitle className="text-lg text-white">{title}</CardTitle>
        <CardDescription className="text-slate-400">{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
});
