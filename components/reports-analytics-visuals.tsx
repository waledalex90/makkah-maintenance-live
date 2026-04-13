"use client";

import { memo } from "react";
import { Download } from "lucide-react";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const CHART_ZONE = ["#38bdf8", "#818cf8", "#34d399", "#fbbf24", "#fb7185", "#94a3b8"];

type InsightData = {
  fastestTech?: { name: string; avgMinutes: number; completed: number } | null;
  busiestZone?: { name: string; count: number } | null;
  topCategory?: { name: string; count: number } | null;
};

type PreviewRow = {
  ticketNumber: string;
  zone: string;
  technician: string;
  category: string;
  createDate: string;
  createTime: string;
  recvDate: string;
  recvTime: string;
  closeDate: string;
  closeTime: string;
  faultHms: string;
  responseHms: string;
  finalStatus: string;
};

type ReportsAnalyticsVisualsProps = {
  insights: InsightData;
  zoneDist: Array<{ name: string; count: number }>;
  chartTechData: Array<{ name: string; fullName: string; count: number; avgMin: number }>;
  daySeries: Array<{ date: string; avgResponseMin: number | null; avgResolutionMin: number | null }>;
  previewRows: PreviewRow[];
  rowsCount: number;
  onExportFastestTech: () => void;
  onExportBusiestZone: () => void;
  onExportTopCategory: () => void;
  onExportZoneChart: () => void;
  onExportTechChart: () => void;
  onExportDaySeries: () => void;
};

export function ReportsAnalyticsVisuals({
  insights,
  zoneDist,
  chartTechData,
  daySeries,
  previewRows,
  rowsCount,
  onExportFastestTech,
  onExportBusiestZone,
  onExportTopCategory,
  onExportZoneChart,
  onExportTechChart,
  onExportDaySeries,
}: ReportsAnalyticsVisualsProps) {
  return (
    <>
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
          onExport={onExportFastestTech}
        />
        <InsightCard
          title="أكثر منطقة أعطالاً"
          value={insights.busiestZone?.name ?? "—"}
          sub={insights.busiestZone ? `${insights.busiestZone.count} بلاغ في النطاق الحالي` : "لا بيانات"}
          accent="from-sky-500/20 to-blue-500/5"
          onExport={onExportBusiestZone}
        />
        <InsightCard
          title="أكثر تصنيف تكراراً"
          value={insights.topCategory?.name ?? "—"}
          sub={insights.topCategory ? `${insights.topCategory.count} بلاغ` : "لا بيانات"}
          accent="from-violet-500/20 to-purple-500/5"
          onExport={onExportTopCategory}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard
          title="توزيع الأعطال حسب المنطقة"
          description="عدد البلاغات لكل منطقة ضمن الفلاتر الحالية"
          onExport={onExportZoneChart}
        >
          <div dir="ltr" className="h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={zoneDist} margin={{ top: 8, right: 8, left: 0, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fill: "#475569", fontSize: 11 }} angle={-28} textAnchor="end" height={70} />
                <YAxis tick={{ fill: "#475569", fontSize: 11 }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 8 }}
                  labelStyle={{ color: "#0f172a" }}
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

        <ChartCard
          title="أداء الفنيين"
          description="عدد المهام المنجزة + متوسط زمن الإصلاح (دقيقة)"
          onExport={onExportTechChart}
        >
          <div dir="ltr" className="h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartTechData} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fill: "#475569", fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={80} />
                <YAxis yAxisId="left" tick={{ fill: "#475569", fontSize: 11 }} allowDecimals={false} />
                <YAxis yAxisId="right" orientation="right" tick={{ fill: "#475569", fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 8 }}
                  formatter={(value, name) => {
                    const n = typeof value === "number" ? value : Number(value);
                    const label = name === "count" ? "عدد المهام" : "متوسط الإصلاح (د)";
                    return [Number.isFinite(n) ? n : "—", label];
                  }}
                  labelFormatter={(_, p) => String((p?.[0]?.payload as { fullName?: string })?.fullName ?? "")}
                />
                <Legend wrapperStyle={{ color: "#475569" }} />
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
        onExport={onExportDaySeries}
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
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fill: "#475569", fontSize: 10 }} />
              <YAxis tick={{ fill: "#475569", fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 8 }}
                formatter={(value, key) => {
                  if (value == null || value === "") return ["—", String(key)];
                  const n = typeof value === "number" ? value : Number(value);
                  const label = key === "avgResponseMin" ? "متوسط الاستجابة" : "متوسط الإصلاح";
                  return [`${Number.isFinite(n) ? n : "—"} د`, label];
                }}
              />
              <Legend wrapperStyle={{ color: "#475569" }} />
              <Area type="monotone" dataKey="avgResponseMin" name="متوسط الاستجابة (د)" stroke="#38bdf8" fill="url(#gResp)" connectNulls />
              <Area type="monotone" dataKey="avgResolutionMin" name="متوسط الإصلاح (د)" stroke="#34d399" fill="url(#gRes)" connectNulls />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-slate-900">معاينة التصدير</CardTitle>
          <CardDescription className="text-slate-500">
            معاينة ورقة التفاصيل الرئيسية؛ أعمدة المدد بصيغة HH:mm:ss. التصدير الفعلي يتبع اختيارك من البطاقة أعلاه.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="min-w-full text-right text-xs text-slate-800">
            <thead className="border-b border-slate-200 text-slate-600">
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
                <tr key={`${ex.ticketNumber}-${i}`} className="border-b border-slate-100">
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
                  <td className="px-2 py-2 font-medium text-emerald-700">{ex.finalStatus}</td>
                </tr>
              ))}
              {rowsCount === 0 ? (
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
    </>
  );
}

const InsightCard = memo(function InsightCard({
  title,
  value,
  sub,
  accent,
  onExport,
}: {
  title: string;
  value: string;
  sub: string;
  accent: string;
  onExport: () => void;
}) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-gradient-to-br ${accent} p-5 shadow-sm`}>
      <div className="mb-1 flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-600">{title}</p>
        <button
          type="button"
          onClick={onExport}
          className="rounded-md border border-slate-200 bg-white p-1 text-emerald-700 hover:bg-slate-50"
          aria-label={`تصدير ${title} إلى Excel`}
        >
          <Download className="h-3.5 w-3.5" />
        </button>
      </div>
      <p className="mt-2 text-xl font-bold text-slate-900">{value}</p>
      <p className="mt-1 text-sm text-slate-600">{sub}</p>
    </div>
  );
});

const ChartCard = memo(function ChartCard({
  title,
  description,
  children,
  onExport,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  onExport: () => void;
}) {
  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-lg text-slate-900">{title}</CardTitle>
            <CardDescription className="text-slate-500">{description}</CardDescription>
          </div>
          <button
            type="button"
            onClick={onExport}
            className="rounded-md border border-slate-200 bg-white p-1.5 text-emerald-700 hover:bg-slate-50"
            aria-label={`تصدير ${title} إلى Excel`}
          >
            <Download className="h-4 w-4" />
          </button>
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
});

