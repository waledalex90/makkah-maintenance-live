"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, Download, Filter, LayoutDashboard, Sparkles } from "lucide-react";
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
  categoryName,
  computeInsights,
  dailyResponseResolutionSeries,
  formatDateDashedMecca,
  formatDurationHMSBetween,
  formatTime12Mecca,
  riyadhDateKey,
  technicianLabel,
  exportFinalStatusLabel,
  distributionByZone,
  technicianPerformance,
  zoneName,
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
import * as XLSX from "xlsx-js-style";

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

type CustomReportField =
  | "reporter_name"
  | "ticket_number"
  | "zone"
  | "category"
  | "technician"
  | "received_time"
  | "repair_time"
  | "final_status";

const CUSTOM_REPORT_FIELD_LABELS: Record<CustomReportField, string> = {
  reporter_name: "اسم المبلغ",
  ticket_number: "رقم البلاغ",
  zone: "المنطقة",
  category: "التصنيف",
  technician: "الفني المسؤول",
  received_time: "وقت الاستلام",
  repair_time: "وقت الإصلاح",
  final_status: "الحالة النهائية",
};

const REPORT_TEMPLATE_STORAGE_KEY = "reports-custom-templates-v1";

type SavedReportTemplate = {
  id: string;
  name: string;
  fields: CustomReportField[];
  dateFrom: string;
  dateTo: string;
  status: TicketStatus | "all";
  zoneId: string;
  technicianId: string;
};

const SYSTEM_REPORT_PRESETS: Array<{
  id: string;
  title: string;
  description: string;
  sheets: ReportSheetId[];
}> = [
  {
    id: "ops-daily",
    title: "تقرير التشغيل اليومي",
    description: "ملخص المناطق + الالتزام + التفاصيل الرئيسية لليوم التشغيلي.",
    sheets: ["main", "zones", "sla"],
  },
  {
    id: "field-performance",
    title: "تقرير أداء الفرق الميدانية",
    description: "أداء الفنيين، الأعطال المتكررة، وتوزيع البلاغات الشهرية.",
    sheets: ["technicians", "recurring", "monthly_density"],
  },
  {
    id: "hajj-command",
    title: "تقرير غرفة عمليات الحج",
    description: "حزمة شاملة لقياس الجاهزية والاستجابة أثناء الذروة.",
    sheets: ["main", "technicians", "zones", "recurring", "monthly_density", "sla"],
  },
];

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
  const [customFields, setCustomFields] = useState<CustomReportField[]>([
    "reporter_name",
    "ticket_number",
    "zone",
    "category",
    "technician",
    "received_time",
    "repair_time",
    "final_status",
  ]);
  const [customDateFrom, setCustomDateFrom] = useState("");
  const [customDateTo, setCustomDateTo] = useState("");
  const [customStatus, setCustomStatus] = useState<TicketStatus | "all">("all");
  const [customZoneId, setCustomZoneId] = useState<string>("all");
  const [customTechnicianId, setCustomTechnicianId] = useState<string>("all");
  const [templateName, setTemplateName] = useState("");
  const [savedTemplates, setSavedTemplates] = useState<SavedReportTemplate[]>([]);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const columnMenuRef = useRef<HTMLDivElement>(null);
  const [columnMenuOpen, setColumnMenuOpen] = useState(false);
  const [columnSearch, setColumnSearch] = useState("");

  useEffect(() => {
    if (!exportMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) setExportMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [exportMenuOpen]);

  useEffect(() => {
    if (!columnMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (columnMenuRef.current && !columnMenuRef.current.contains(e.target as Node)) setColumnMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [columnMenuOpen]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(REPORT_TEMPLATE_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as SavedReportTemplate[];
      if (Array.isArray(parsed)) setSavedTemplates(parsed);
    } catch {
      setSavedTemplates([]);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(REPORT_TEMPLATE_STORAGE_KEY, JSON.stringify(savedTemplates));
  }, [savedTemplates]);

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
  const customPreviewRows = useMemo(() => {
    return rows.filter((row) => {
      const zoneId = String((row as unknown as Record<string, unknown>).zone_id ?? "all");
      const status = String((row as unknown as Record<string, unknown>).status ?? "");
      const techId =
        row.assigned_technician_id ?? row.assigned_engineer_id ?? row.assigned_supervisor_id ?? "all";
      if (customDateFrom) {
        const fromMs = new Date(`${customDateFrom}T00:00:00.000+03:00`).getTime();
        if (new Date(row.created_at).getTime() < fromMs) return false;
      }
      if (customDateTo) {
        const toMs = new Date(`${customDateTo}T23:59:59.999+03:00`).getTime();
        if (new Date(row.created_at).getTime() > toMs) return false;
      }
      if (customZoneId !== "all" && zoneId !== customZoneId) return false;
      if (customStatus !== "all" && status !== customStatus) return false;
      if (customTechnicianId !== "all" && techId !== customTechnicianId) return false;
      return true;
    });
  }, [rows, customDateFrom, customDateTo, customZoneId, customStatus, customTechnicianId]);

  const toggleCustomField = (field: CustomReportField) => {
    setCustomFields((prev) => {
      if (prev.includes(field)) {
        if (prev.length === 1) return prev;
        return prev.filter((f) => f !== field);
      }
      return [...prev, field];
    });
  };

  const filteredColumnOptions = useMemo(() => {
    const q = columnSearch.trim();
    if (!q) return Object.entries(CUSTOM_REPORT_FIELD_LABELS);
    return Object.entries(CUSTOM_REPORT_FIELD_LABELS).filter(([, label]) => label.includes(q));
  }, [columnSearch]);

  const applySystemPreset = (sheets: ReportSheetId[]) => {
    const next = REPORT_SHEET_IDS.reduce((acc, id) => ({ ...acc, [id]: sheets.includes(id) }), {} as ReportExportSelection);
    setExportSelection(next);
  };

  const cellValueForField = (row: ReportTicketRow, field: CustomReportField): string => {
    const raw = row as unknown as Record<string, unknown>;
    switch (field) {
      case "reporter_name":
        return String(raw.reporter_name ?? "—");
      case "ticket_number":
        return String(raw.external_ticket_number ?? raw.ticket_number ?? raw.id ?? "-");
      case "zone":
        return zoneName(row.zones);
      case "category":
        return categoryName(row.ticket_categories);
      case "technician":
        return technicianLabel(row);
      case "received_time":
        return row.received_at ? formatTime12Mecca(row.received_at) : "انتظار";
      case "repair_time":
        return row.closed_at ? formatTime12Mecca(row.closed_at) : "انتظار";
      case "final_status":
        return exportFinalStatusLabel(row);
      default:
        return "-";
    }
  };

  const exportCustomPreviewExcel = useCallback(() => {
    const headers = customFields.map((f) => CUSTOM_REPORT_FIELD_LABELS[f]);
    const body = customPreviewRows.map((row) => customFields.map((field) => cellValueForField(row, field)));
    const ws = XLSX.utils.aoa_to_sheet([["غرفة عمليات الحج - مكة"], headers, ...body]);
    ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: Math.max(headers.length - 1, 0) } }];
    const logoCell = ws["A1"];
    if (logoCell) {
      logoCell.s = {
        font: { bold: true, sz: 13, color: { rgb: "065F46" } },
        alignment: { horizontal: "center", vertical: "center" },
      };
    }
    ws["!cols"] = headers.map(() => ({ wch: 22 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "تقرير مخصص");
    XLSX.writeFile(wb, `custom_report_${new Date().toISOString().slice(0, 10)}.xlsx`, { cellStyles: true });
  }, [customFields, customPreviewRows]);

  const saveCurrentTemplate = useCallback(() => {
    const name = templateName.trim();
    if (!name) return;
    const tpl: SavedReportTemplate = {
      id: `${Date.now()}`,
      name,
      fields: customFields,
      dateFrom: customDateFrom,
      dateTo: customDateTo,
      status: customStatus,
      zoneId: customZoneId,
      technicianId: customTechnicianId,
    };
    setSavedTemplates((prev) => [tpl, ...prev].slice(0, 20));
    setTemplateName("");
  }, [templateName, customFields, customDateFrom, customDateTo, customStatus, customZoneId, customTechnicianId]);

  const applyTemplate = useCallback((tpl: SavedReportTemplate) => {
    setCustomFields(tpl.fields.length > 0 ? tpl.fields : ["reporter_name"]);
    setCustomDateFrom(tpl.dateFrom ?? "");
    setCustomDateTo(tpl.dateTo ?? "");
    setCustomStatus(tpl.status);
    setCustomZoneId(tpl.zoneId);
    setCustomTechnicianId(tpl.technicianId ?? "all");
  }, []);

  const exportScopedRows = useCallback(
    (scopedRows: ReportTicketRow[]) => {
      if (scopedRows.length === 0) return;
      downloadPremiumReportsExcel(
        scopedRows,
        { main: true, technicians: false, zones: false, recurring: false, monthly_density: false, sla: false },
        "single_workbook",
        { dateFrom: filters.dateFrom, dateTo: filters.dateTo },
      );
    },
    [filters.dateFrom, filters.dateTo],
  );

  const exportFastestTech = useCallback(() => {
    const name = insights.fastestTech?.name;
    if (!name) return;
    exportScopedRows(rows.filter((r) => technicianLabel(r) === name));
  }, [insights.fastestTech?.name, rows, exportScopedRows]);

  const exportBusiestZone = useCallback(() => {
    const name = insights.busiestZone?.name;
    if (!name) return;
    exportScopedRows(rows.filter((r) => zoneName(r.zones) === name));
  }, [insights.busiestZone?.name, rows, exportScopedRows]);

  const exportTopCategory = useCallback(() => {
    const name = insights.topCategory?.name;
    if (!name) return;
    exportScopedRows(rows.filter((r) => categoryName(r.ticket_categories) === name));
  }, [insights.topCategory?.name, rows, exportScopedRows]);

  const exportZoneChart = useCallback(() => {
    const names = new Set(zoneDist.map((z) => z.name));
    exportScopedRows(rows.filter((r) => names.has(zoneName(r.zones))));
  }, [zoneDist, rows, exportScopedRows]);

  const exportTechChart = useCallback(() => {
    const names = new Set(chartTechData.map((t) => t.fullName));
    exportScopedRows(rows.filter((r) => names.has(technicianLabel(r))));
  }, [chartTechData, rows, exportScopedRows]);

  const exportDaySeries = useCallback(() => {
    const days = new Set(daySeries.map((d) => d.date));
    exportScopedRows(rows.filter((r) => days.has(riyadhDateKey(r.created_at))));
  }, [daySeries, rows, exportScopedRows]);

  return (
    <div className="min-h-screen bg-slate-50 pb-12 pt-6 text-slate-900" dir="rtl" lang="ar">
      <div className="mx-auto max-w-7xl space-y-6 px-4 sm:px-6">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              تحليلات مباشرة
            </div>
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              <LayoutDashboard className="h-8 w-8 text-emerald-600" aria-hidden />
              لوحة تحكم التقارير
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              مؤشرات الأداء، توزيع الأعطال، وزمن الاستجابة والإصلاح — مع فلاتر وتصدير Excel (مدد بصيغة HH:mm:ss).
            </p>
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-2">
          <Card className="border-slate-200 bg-white text-slate-900 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">إنشاء تقرير مخصص</CardTitle>
              <CardDescription className="text-slate-500">
                اختر الحقول والفلاتر التشغيلية لبناء تقرير مخصص قبل التصدير.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-right">
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700">
                معاينة فورية: {customPreviewRows.length} صف | ترتيب الأعمدة: {customFields.length}
              </div>

              <div className="space-y-2 rounded-xl border border-slate-200 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-800">اختيار الأعمدة</p>
                  <span className="text-[11px] text-slate-500">الترتيب حسب اختيارك</span>
                </div>
                <div ref={columnMenuRef} className="relative">
                  <button
                    type="button"
                    className="flex h-10 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800"
                    onClick={() => setColumnMenuOpen((v) => !v)}
                    aria-expanded={columnMenuOpen}
                  >
                    <span>{customFields.length ? `${customFields.length} عمود محدد` : "اختر الأعمدة"}</span>
                    <ChevronDown className={`h-4 w-4 transition-transform ${columnMenuOpen ? "rotate-180" : ""}`} />
                  </button>
                  {columnMenuOpen ? (
                    <div className="absolute z-40 mt-1 w-full rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
                      <Input
                        className="h-9 border-slate-200"
                        placeholder="ابحث عن عمود..."
                        value={columnSearch}
                        onChange={(e) => setColumnSearch(e.target.value)}
                      />
                      <div className="mt-2 max-h-56 overflow-auto space-y-1">
                        {filteredColumnOptions.map(([key, label]) => {
                          const field = key as CustomReportField;
                          const selected = customFields.includes(field);
                          return (
                            <button
                              key={field}
                              type="button"
                              className="flex w-full items-center justify-between rounded-md border border-slate-100 px-2 py-1.5 text-sm hover:bg-slate-50"
                              onClick={() => toggleCustomField(field)}
                            >
                              <span>{label}</span>
                              {selected ? <Check className="h-4 w-4 text-emerald-600" /> : null}
                            </button>
                          );
                        })}
                      </div>
                      <div className="mt-2 flex justify-end">
                        <Button type="button" className="h-8 bg-emerald-600 px-3 text-xs text-white hover:bg-emerald-700" onClick={() => setColumnMenuOpen(false)}>
                          تم
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {customFields.map((field, idx) => (
                    <span key={field} className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-700">
                      {idx + 1}. {CUSTOM_REPORT_FIELD_LABELS[field]}
                    </span>
                  ))}
                </div>
              </div>

              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                <div>
                  <Label className="mb-1 block">من تاريخ</Label>
                  <Input className="h-9 border-slate-200 bg-white" type="date" value={customDateFrom} onChange={(e) => setCustomDateFrom(e.target.value)} />
                </div>
                <div>
                  <Label className="mb-1 block">إلى تاريخ</Label>
                  <Input className="h-9 border-slate-200 bg-white" type="date" value={customDateTo} onChange={(e) => setCustomDateTo(e.target.value)} />
                </div>
                <div>
                  <Label className="mb-1 block">المنطقة</Label>
                  <select
                    className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                    value={customZoneId}
                    onChange={(e) => setCustomZoneId(e.target.value)}
                  >
                    <option value="all">كل المناطق</option>
                    {(zonesQuery.data ?? []).map((z) => (
                      <option key={z.id} value={z.id}>
                        {z.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="mb-1 block">حالة البلاغ</Label>
                  <select
                    className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                    value={customStatus}
                    onChange={(e) => setCustomStatus(e.target.value as TicketStatus | "all")}
                  >
                    <option value="all">كل الحالات</option>
                    <option value="not_received">{statusLabelAr("not_received")}</option>
                    <option value="received">{statusLabelAr("received")}</option>
                    <option value="finished">{statusLabelAr("finished")}</option>
                  </select>
                </div>
                <div className="md:col-span-2 xl:col-span-4">
                  <Label className="mb-1 block">الفني المسؤول</Label>
                  <select
                    className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                    value={customTechnicianId}
                    onChange={(e) => setCustomTechnicianId(e.target.value)}
                  >
                    <option value="all">الكل</option>
                    {(techniciansQuery.data ?? []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.full_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder="حفظ كنموذج: تقرير أداء الفنيين الأسبوعي"
                  />
                  <Button type="button" className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={saveCurrentTemplate}>
                    حفظ كنموذج
                  </Button>
                </div>
                {savedTemplates.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {savedTemplates.slice(0, 8).map((tpl) => (
                      <button
                        key={tpl.id}
                        type="button"
                        className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs hover:bg-slate-50"
                        onClick={() => applyTemplate(tpl)}
                      >
                        {tpl.name}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white text-slate-900 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">تقارير النظام الأساسية</CardTitle>
              <CardDescription className="text-slate-500">
                قوالب جاهزة للاستخدام السريع بنمط عمليات الحج.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {SYSTEM_REPORT_PRESETS.map((preset) => (
                <div key={preset.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-sm font-semibold text-slate-900">{preset.title}</p>
                  <p className="mt-1 text-xs text-slate-600">{preset.description}</p>
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-2 h-8 border-slate-300 bg-white text-xs text-slate-800 hover:bg-slate-100"
                    onClick={() => applySystemPreset(preset.sheets)}
                  >
                    اختيار هذا التقرير
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>

        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="border-b border-slate-200 pb-3">
            <CardTitle className="text-base text-slate-900">تصدير التقارير</CardTitle>
            <CardDescription className="text-slate-500">
              قائمة منسدلة متعددة الاختيار للتقارير المتاحة، ثم طريقة التصدير. ورقة «كثافة البلاغات الشهرية» تستخدم
              فلتر التاريخ لتمييز أعمدة الجمعة في الشهر المرجعي.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <div ref={exportMenuRef} className="relative max-w-xl">
              <Button
                type="button"
                variant="outline"
                className="flex w-full items-center justify-between border-slate-300 bg-white text-slate-900 hover:bg-slate-50"
                onClick={() => setExportMenuOpen((o) => !o)}
                aria-expanded={exportMenuOpen}
                aria-haspopup="listbox"
              >
                <span>
                  اختيار التقارير
                  {selectedCount > 0 ? (
                    <span className="ms-2 text-emerald-400">({selectedCount} مختار)</span>
                  ) : (
                    <span className="ms-2 text-slate-400">(لا شيء)</span>
                  )}
                </span>
                <ChevronDown className={`size-4 shrink-0 transition-transform ${exportMenuOpen ? "rotate-180" : ""}`} />
              </Button>
              {exportMenuOpen ? (
                <div
                  className="absolute z-50 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-2 shadow-lg"
                  role="listbox"
                  aria-multiselectable
                >
                  <div className="flex gap-2 border-b border-slate-200 px-3 pb-2">
                    <button
                      type="button"
                      className="text-xs text-emerald-400 hover:underline"
                      onClick={selectAllExports}
                    >
                      تحديد الكل
                    </button>
                    <span className="text-slate-300">|</span>
                    <button type="button" className="text-xs text-slate-600 hover:underline" onClick={clearExports}>
                      إلغاء الكل
                    </button>
                  </div>
                  <ul className="px-1 pt-1">
                    {REPORT_SHEET_IDS.map((id) => (
                      <li key={id}>
                        <label className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                          <input
                            type="checkbox"
                            className="size-4 shrink-0 rounded border-slate-300 bg-white text-emerald-600 focus:ring-emerald-500"
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
            <fieldset className="space-y-2 rounded-lg border border-slate-200 p-3">
              <legend className="px-1 text-xs font-medium text-slate-500">طريقة التصدير</legend>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                <input
                  type="radio"
                  name="report-export-mode"
                  className="size-4 border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  checked={exportMode === "single_workbook"}
                  onChange={() => setExportMode("single_workbook")}
                />
                ملف Excel واحد يضم الأوراق المختارة فقط (RTL وتنسيق احترافي)
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                <input
                  type="radio"
                  name="report-export-mode"
                  className="size-4 border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  checked={exportMode === "separate_files"}
                  onChange={() => setExportMode("separate_files")}
                />
                ملف منفصل لكل تقرير مختار (عدة تنزيلات متتابعة)
              </label>
            </fieldset>
            <Button
              type="button"
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={() => exportExcel()}
              disabled={rows.length === 0 || selectedCount === 0}
            >
              <Download className="ms-2 h-4 w-4" aria-hidden />
              تصدير ({selectedCount} {selectedCount === 1 ? "تقرير" : "تقارير"})
            </Button>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="border-b border-slate-200 pb-4">
            <CardTitle className="flex items-center gap-2 text-lg text-slate-900">
              <Filter className="h-5 w-5 text-emerald-600" aria-hidden />
              فلاتر متقدمة
            </CardTitle>
            <CardDescription className="text-slate-500">طبّق الفلتر ثم اضغط «تحديث» لتحديث الرسوم فوراً.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 pt-4 sm:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-2">
              <Label className="text-slate-700">من تاريخ</Label>
              <Input
                type="date"
                className="border-slate-300 bg-white text-slate-900"
                value={draft.dateFrom}
                onChange={(e) => setDraft((d) => ({ ...d, dateFrom: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-700">إلى تاريخ</Label>
              <Input
                type="date"
                className="border-slate-300 bg-white text-slate-900"
                value={draft.dateTo}
                onChange={(e) => setDraft((d) => ({ ...d, dateTo: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-700">المنطقة</Label>
              <select
                className="flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900"
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
              <Label className="text-slate-700">الفني / المهندس / المشرف</Label>
              <select
                className="flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900"
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
              <Label className="text-slate-700">الحالة</Label>
              <select
                className="flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900"
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
                className="border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
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

        <Card className="border-slate-200 bg-white text-slate-900 shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">معاينة التقرير المخصص</CardTitle>
              <Button
                type="button"
                className="h-8 bg-emerald-600 px-3 text-xs text-white hover:bg-emerald-700"
                onClick={exportCustomPreviewExcel}
                disabled={customPreviewRows.length === 0}
              >
                <Download className="ms-1 h-3.5 w-3.5" />
                تصدير المعاينة
              </Button>
            </div>
            <CardDescription className="text-slate-500">عرض أول 8 صفوف حسب الحقول والفلاتر المختارة.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="min-w-full text-right text-xs">
              <thead className="border-b border-slate-200 text-slate-600">
                <tr>
                  {customFields.map((field) => (
                    <th key={field} className="px-2 py-2">
                      {CUSTOM_REPORT_FIELD_LABELS[field]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {customPreviewRows.slice(0, 8).map((row, idx) => (
                  <tr key={idx} className="border-b border-slate-100 text-slate-800">
                    {customFields.map((field) => (
                      <td key={field} className="whitespace-nowrap px-2 py-2">
                        {cellValueForField(row, field)}
                      </td>
                    ))}
                  </tr>
                ))}
                {customPreviewRows.length === 0 ? (
                  <tr>
                    <td colSpan={Math.max(customFields.length, 1)} className="px-2 py-6 text-center text-slate-500">
                      لا توجد بيانات مطابقة للتقرير المخصص.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <ReportsAnalyticsVisuals
          insights={insights}
          zoneDist={zoneDist}
          chartTechData={chartTechData}
          daySeries={daySeries}
          previewRows={previewRows}
          rowsCount={rows.length}
          onExportFastestTech={exportFastestTech}
          onExportBusiestZone={exportBusiestZone}
          onExportTopCategory={exportTopCategory}
          onExportZoneChart={exportZoneChart}
          onExportTechChart={exportTechChart}
          onExportDaySeries={exportDaySeries}
        />
      </div>

    </div>
  );
}
