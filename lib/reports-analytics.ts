import type { TicketStatus } from "@/lib/ticket-status";
import { DEFAULT_TICKETING_SETTINGS } from "@/lib/resolved-settings";

/** @deprecated استخدم الإعدادات المحلولة؛ يبقى للتوافق مع استيرادات قديمة */
export const REPORTS_PICKUP_SLACK_MINUTES = DEFAULT_TICKETING_SETTINGS.pickup_threshold_minutes;

/** عتبة «التنفيذ السريع» في ورقة الالتزام (دقيقة من الإنشاء حتى الإغلاق) */
export const REPORTS_FAST_CLOSE_SLA_MINUTES = 120;

const MECCA_TZ = "Asia/Riyadh";

export type ZoneJoin = { name: string } | { name: string }[] | null;
export type CategoryJoin = { name: string } | { name: string }[] | null;
export type ProfileJoin = { full_name: string } | { full_name: string }[] | null;

export type ReportTicketRow = {
  id: string;
  reporter_name?: string | null;
  ticket_number?: number | null;
  external_ticket_number?: string | null;
  status: TicketStatus;
  created_at: string;
  received_at?: string | null;
  closed_at?: string | null;
  zone_id?: string | null;
  category_id?: number | null;
  assigned_technician_id?: string | null;
  assigned_engineer_id?: string | null;
  assigned_supervisor_id?: string | null;
  zones?: ZoneJoin;
  ticket_categories?: CategoryJoin;
  assigned_technician?: ProfileJoin;
  assigned_engineer?: ProfileJoin;
  assigned_supervisor?: ProfileJoin;
};

export const REPORTS_TICKET_SELECT =
  "id, reporter_name, ticket_number, external_ticket_number, status, created_at, received_at, closed_at, zone_id, category_id, assigned_technician_id, assigned_engineer_id, assigned_supervisor_id, " +
  "zones(name), ticket_categories(name), " +
  "assigned_technician:profiles!assigned_technician_id(full_name), " +
  "assigned_engineer:profiles!assigned_engineer_id(full_name), " +
  "assigned_supervisor:profiles!assigned_supervisor_id(full_name)";

export function embedName(p: ProfileJoin | undefined): string | null {
  if (!p) return null;
  const o = Array.isArray(p) ? p[0] : p;
  return o?.full_name?.trim() || null;
}

export function zoneName(z: ZoneJoin | undefined): string {
  if (!z) return "بدون منطقة";
  const o = Array.isArray(z) ? z[0] : z;
  return o?.name?.trim() || "بدون منطقة";
}

export function categoryName(c: CategoryJoin | undefined): string {
  if (!c) return "بدون تصنيف";
  const o = Array.isArray(c) ? c[0] : c;
  return o?.name?.trim() || "بدون تصنيف";
}

export function technicianLabel(row: ReportTicketRow): string {
  return (
    embedName(row.assigned_technician) ||
    embedName(row.assigned_engineer) ||
    embedName(row.assigned_supervisor) ||
    "—"
  );
}

export function technicianId(row: ReportTicketRow): string | null {
  return row.assigned_technician_id ?? row.assigned_engineer_id ?? row.assigned_supervisor_id ?? null;
}

export function ticketDisplayNumber(row: ReportTicketRow): string {
  if (row.external_ticket_number?.trim()) return row.external_ticket_number.trim();
  if (row.ticket_number != null) return String(row.ticket_number);
  return row.id.slice(0, 8);
}

export function minutesBetween(
  startIso: string | null | undefined,
  endIso: string | null | undefined,
): number | null {
  if (!startIso || !endIso) return null;
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.round(ms / 60000);
}

export function secondsBetween(
  startIso: string | null | undefined,
  endIso: string | null | undefined,
): number | null {
  if (!startIso || !endIso) return null;
  const sec = Math.floor((new Date(endIso).getTime() - new Date(startIso).getTime()) / 1000);
  if (!Number.isFinite(sec) || sec < 0) return null;
  return sec;
}

export function riyadhDateKey(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: MECCA_TZ });
}

/** مكوّنات التاريخ الميلادي بتوقيت مكة */
export function riyadhCalendarComponents(iso: string): { y: number; m: number; d: number } {
  const d = new Date(iso);
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: MECCA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  return {
    y: parseInt(fmt.find((p) => p.type === "year")?.value ?? "0", 10),
    m: parseInt(fmt.find((p) => p.type === "month")?.value ?? "1", 10),
    d: parseInt(fmt.find((p) => p.type === "day")?.value ?? "1", 10),
  };
}

/** يوم الشهر 1–31 حسب تقويم مكة */
export function riyadhDayOfMonth(iso: string): number {
  return riyadhCalendarComponents(iso).d;
}

/** 0 = الأحد … 6 = السبت — بتوقيت مكة */
export function riyadhWeekdayIndex(iso: string): number {
  const d = new Date(iso);
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: MECCA_TZ, weekday: "long" }).format(d);
  const map: Record<string, number> = {
    Sunday: 0,
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6,
  };
  return map[wd] ?? 0;
}

/**
 * سنة/شهر مرجعي لعناوين الجمعة في ورقة كثافة الشهر:
 * يفضّل «من تاريخ» ثم «إلى تاريخ» ثم أقدم بلاغ في النطاق ثم اليوم بتوقيت مكة.
 */
export function inferReportReferenceYearMonth(
  dateFrom?: string,
  dateTo?: string,
  rows: ReportTicketRow[] = [],
): { year: number; month: number } {
  const parseYmd = (s?: string) => {
    if (!s?.trim()) return null;
    const [y, m] = s.trim().split("-").map(Number);
    if (!y || !m || m < 1 || m > 12) return null;
    return { year: y, month: m };
  };
  const from = parseYmd(dateFrom);
  if (from) return from;
  const to = parseYmd(dateTo);
  if (to) return to;
  if (rows.length) {
    let minIso = rows[0]!.created_at;
    let minT = new Date(minIso).getTime();
    for (const r of rows) {
      const t = new Date(r.created_at).getTime();
      if (Number.isFinite(t) && t < minT) {
        minT = t;
        minIso = r.created_at;
      }
    }
    const { y, m } = riyadhCalendarComponents(minIso);
    if (y) return { year: y, month: m };
  }
  const { y, m } = riyadhCalendarComponents(new Date().toISOString());
  return { year: y || new Date().getFullYear(), month: m || 1 };
}

/** أرقام الأعمدة 1..31 التي تقع فيها جمعة في الشهر المحدد (توقيت مكة) — لاستخدامها في تنسيق Excel */
export function fridayDayNumbersInMonth(year: number, month: number): Set<number> {
  const out = new Set<number>();
  for (let day = 1; day <= 31; day++) {
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T12:00:00+03:00`;
    const cal = riyadhCalendarComponents(iso);
    if (cal.y !== year || cal.m !== month || cal.d !== day) continue;
    if (riyadhWeekdayIndex(iso) === 5) out.add(day);
  }
  return out;
}

export type ZoneCount = { name: string; count: number };
export function distributionByZone(rows: ReportTicketRow[]): ZoneCount[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    const z = zoneName(r.zones);
    map.set(z, (map.get(z) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

export type TechPerf = {
  id: string;
  name: string;
  completed: number;
  avgResolutionMinutes: number | null;
};

export function technicianPerformance(rows: ReportTicketRow[]): TechPerf[] {
  type Acc = { name: string; resolutions: number[] };
  const byId = new Map<string, Acc>();
  for (const r of rows) {
    const id = technicianId(r);
    if (!id) continue;
    if (r.status !== "finished" || !r.closed_at) continue;
    const name = technicianLabel(r);
    const resMin = minutesBetween(r.received_at ?? r.created_at, r.closed_at);
    if (resMin === null) continue;
    const cur = byId.get(id) ?? { name, resolutions: [] };
    cur.name = name;
    cur.resolutions.push(resMin);
    byId.set(id, cur);
  }
  const out: TechPerf[] = [];
  for (const [id, acc] of byId) {
    const sum = acc.resolutions.reduce((a, b) => a + b, 0);
    out.push({
      id,
      name: acc.name,
      completed: acc.resolutions.length,
      avgResolutionMinutes: acc.resolutions.length ? Math.round(sum / acc.resolutions.length) : null,
    });
  }
  return out.sort((a, b) => b.completed - a.completed);
}

export type DayMetric = {
  date: string;
  avgResponseMin: number | null;
  avgResolutionMin: number | null;
  sampleSize: number;
};

export function dailyResponseResolutionSeries(rows: ReportTicketRow[]): DayMetric[] {
  const buckets = new Map<string, { resp: number[]; res: number[] }>();
  for (const r of rows) {
    const day = riyadhDateKey(r.created_at);
    const b = buckets.get(day) ?? { resp: [], res: [] };
    const resp = minutesBetween(r.created_at, r.received_at);
    if (resp !== null) b.resp.push(resp);
    if (r.status === "finished" && r.closed_at) {
      const res = minutesBetween(r.received_at ?? r.created_at, r.closed_at);
      if (res !== null) b.res.push(res);
    }
    buckets.set(day, b);
  }
  const keys = [...buckets.keys()].sort();
  return keys.map((date) => {
    const b = buckets.get(date)!;
    const avgResp =
      b.resp.length > 0 ? Math.round(b.resp.reduce((a, c) => a + c, 0) / b.resp.length) : null;
    const avgRes =
      b.res.length > 0 ? Math.round(b.res.reduce((a, c) => a + c, 0) / b.res.length) : null;
    return { date, avgResponseMin: avgResp, avgResolutionMin: avgRes, sampleSize: b.resp.length + b.res.length };
  });
}

export type Insights = {
  fastestTech: { name: string; avgMinutes: number; completed: number } | null;
  busiestZone: { name: string; count: number } | null;
  topCategory: { name: string; count: number } | null;
};

export function computeInsights(rows: ReportTicketRow[], perf: TechPerf[]): Insights {
  const withMin2 = perf.filter((p) => p.completed >= 2 && p.avgResolutionMinutes != null);
  const fastest =
    withMin2.length > 0
      ? [...withMin2].sort((a, b) => (a.avgResolutionMinutes ?? 1e9) - (b.avgResolutionMinutes ?? 1e9))[0]!
      : perf.filter((p) => p.avgResolutionMinutes != null).sort(
          (a, b) => (a.avgResolutionMinutes ?? 1e9) - (b.avgResolutionMinutes ?? 1e9),
        )[0];
  const fastestTech = fastest
    ? {
        name: fastest.name,
        avgMinutes: fastest.avgResolutionMinutes ?? 0,
        completed: fastest.completed,
      }
    : null;

  const zones = distributionByZone(rows);
  const busiestZone = zones[0] ? { name: zones[0].name, count: zones[0].count } : null;

  const catMap = new Map<string, number>();
  for (const r of rows) {
    const c = categoryName(r.ticket_categories);
    catMap.set(c, (catMap.get(c) ?? 0) + 1);
  }
  const topCat = [...catMap.entries()].sort((a, b) => b[1] - a[1])[0];
  const topCategory = topCat ? { name: topCat[0], count: topCat[1] } : null;

  return { fastestTech, busiestZone, topCategory };
}

/** تاريخ DD-MM-YYYY بتوقيت مكة */
export function formatDateDashedMecca(iso: string | null | undefined): string {
  if (!iso?.trim()) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: MECCA_TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(d);
  const dd = parts.find((p) => p.type === "day")?.value ?? "";
  const mm = parts.find((p) => p.type === "month")?.value ?? "";
  const yy = parts.find((p) => p.type === "year")?.value ?? "";
  return `${dd}-${mm}-${yy}`;
}

/** وقت 12 ساعة (مثال 03:45 PM) بتوقيت مكة */
export function formatTime12Mecca(iso: string | null | undefined): string {
  if (!iso?.trim()) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: MECCA_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

/** تواريخ مقروءة بتوقيت مكة (للتوافق مع الواجهات القديمة) */
export function formatReportDateTimeMecca(iso: string | null | undefined): string {
  if (!iso?.trim()) return "—";
  return `${formatDateDashedMecca(iso)} | ${formatTime12Mecca(iso)}`;
}

/** مدة بصيغة HH:mm:ss (إجمالي الساعات قد يتجاوز ٢٤) من حدَي زمنيين — توقيت الحساب من الطوابع الفعلية */
export function formatDurationHMSBetween(
  startIso: string | null | undefined,
  endIso: string | null | undefined,
): string {
  const sec = secondsBetween(startIso, endIso);
  if (sec == null) return "—";
  return formatSecondsAsHMS(sec);
}

/** تنسيق مدة رقمية مختصرة HH:mm:ss (للتقارير والتصدير) */
export function formatSecondsAsHMS(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec2 = s % 60;
  const hh = String(h).padStart(2, "0");
  const mm = String(m).padStart(2, "0");
  const ss = String(sec2).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function avgSecondsOrDash(values: number[]): string {
  if (values.length === 0) return "—";
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return formatSecondsAsHMS(Math.round(avg));
}

/** مكتمل / قيد التنفيذ / متأخر / انتظار */
export function exportFinalStatusLabel(
  row: ReportTicketRow,
  nowMs: number = Date.now(),
  pickupSlackMinutes: number = DEFAULT_TICKETING_SETTINGS.pickup_threshold_minutes,
): string {
  if (row.status === "finished") return "مكتمل";
  if (row.status === "received") return "قيد التنفيذ";
  const created = new Date(row.created_at).getTime();
  if (!Number.isFinite(created)) return "—";
  const ageMin = (nowMs - created) / 60_000;
  if (ageMin > pickupSlackMinutes) return "متأخر";
  return "انتظار";
}

/** صف التفاصيل الرئيسية — Elite (تاريخ | وقت منفصلان، مدد HMS) */
export type EliteMainDetailRow = {
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

export function buildEliteMainDetailsRows(
  rows: ReportTicketRow[],
  nowMs: number = Date.now(),
  pickupSlackMinutes: number = DEFAULT_TICKETING_SETTINGS.pickup_threshold_minutes,
): EliteMainDetailRow[] {
  const sorted = [...rows].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const nowIso = new Date(nowMs).toISOString();
  return sorted.map((r) => {
    const recv = r.received_at?.trim();
    const close = r.closed_at?.trim();

    const faultEnd = close ?? (r.status !== "finished" ? nowIso : null);
    const faultHms =
      faultEnd != null ? formatDurationHMSBetween(r.created_at, faultEnd) : "—";

    const responseHms = recv ? formatDurationHMSBetween(r.created_at, recv) : "—";

    return {
      ticketNumber: ticketDisplayNumber(r),
      zone: zoneName(r.zones),
      technician: technicianLabel(r),
      category: categoryName(r.ticket_categories),
      createDate: formatDateDashedMecca(r.created_at),
      createTime: formatTime12Mecca(r.created_at),
      recvDate: recv ? formatDateDashedMecca(recv) : "انتظار",
      recvTime: recv ? formatTime12Mecca(recv) : "انتظار",
      closeDate: close ? formatDateDashedMecca(close) : r.status === "finished" ? "—" : "انتظار",
      closeTime: close ? formatTime12Mecca(close) : r.status === "finished" ? "—" : "انتظار",
      faultHms,
      responseHms,
      finalStatus: exportFinalStatusLabel(r, nowMs, pickupSlackMinutes),
    };
  });
}

/** ورقة أداء الفنيين */
export function buildTechniciansSheetRows(rows: ReportTicketRow[]): string[][] {
  type Acc = {
    name: string;
    finished: number;
    respSec: number[];
    repairSec: number[];
  };
  const byId = new Map<string, Acc>();
  for (const r of rows) {
    const id = technicianId(r);
    if (!id) continue;
    const name = technicianLabel(r);
    const cur = byId.get(id) ?? { name, finished: 0, respSec: [], repairSec: [] };
    if (r.received_at?.trim()) {
      const s = secondsBetween(r.created_at, r.received_at);
      if (s != null) cur.respSec.push(s);
    }
    if (r.status === "finished" && r.closed_at?.trim()) {
      cur.finished += 1;
      const s = secondsBetween(r.received_at ?? r.created_at, r.closed_at);
      if (s != null) cur.repairSec.push(s);
    }
    byId.set(id, cur);
  }
  const header = ["اسم الفني", "عدد البلاغات المنجزة", "متوسط زمن الاستجابة", "متوسط زمن الإصلاح"];
  const body = [...byId.values()]
    .sort((a, b) => b.finished - a.finished || b.respSec.length - a.respSec.length)
    .map((a) => [
      a.name,
      String(a.finished),
      avgSecondsOrDash(a.respSec),
      avgSecondsOrDash(a.repairSec),
    ]);
  return [header, ...body];
}

/** ورقة المناطق والقطاعات */
export function buildZonesSectorSheetRows(rows: ReportTicketRow[]): string[][] {
  type ZAcc = { total: number; byCat: Map<string, number>; repairSec: number[] };
  const byZone = new Map<string, ZAcc>();
  for (const r of rows) {
    const z = zoneName(r.zones);
    const cat = categoryName(r.ticket_categories);
    const cur = byZone.get(z) ?? { total: 0, byCat: new Map<string, number>(), repairSec: [] };
    cur.total += 1;
    cur.byCat.set(cat, (cur.byCat.get(cat) ?? 0) + 1);
    if (r.status === "finished" && r.closed_at?.trim()) {
      const s = secondsBetween(r.received_at ?? r.created_at, r.closed_at);
      if (s != null) cur.repairSec.push(s);
    }
    byZone.set(z, cur);
  }
  const header = ["المنطقة", "إجمالي الأعطال", "أكثر قطاع معطل", "متوسط زمن الإصلاح في المنطقة"];
  const body = [...byZone.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .map(([zone, acc]) => {
      const topCat = [...acc.byCat.entries()].sort((x, y) => y[1] - x[1])[0];
      return [zone, String(acc.total), topCat ? topCat[0] : "—", avgSecondsOrDash(acc.repairSec)];
    });
  return [header, ...body];
}

/** مناطق + يوم مكة + تصنيف تكرّر فيه بلاغان أو أكثر */
export function buildRecurringHotspotsRows(rows: ReportTicketRow[]): string[][] {
  const keyToTickets = new Map<string, { zone: string; day: string; cat: string; nums: string[] }>();
  for (const r of rows) {
    const day = riyadhDateKey(r.created_at);
    const z = zoneName(r.zones);
    const cat = categoryName(r.ticket_categories);
    const k = `${day}|${z}|${cat}`;
    const cur = keyToTickets.get(k) ?? { zone: z, day, cat, nums: [] };
    cur.nums.push(ticketDisplayNumber(r));
    keyToTickets.set(k, cur);
  }
  const header = ["التاريخ (مكة)", "المنطقة", "التصنيف", "عدد التكرار في اليوم", "أرقام البلاغات (عينة)"];
  const body = [...keyToTickets.values()]
    .filter((v) => v.nums.length >= 2)
    .sort((a, b) => b.nums.length - a.nums.length)
    .map((v) => [v.day, v.zone, v.cat, String(v.nums.length), v.nums.slice(0, 8).join("، ")]);
  return [header, ...body];
}

/**
 * كثافة البلاغات الشهرية: صفوف = المناطق، أعمدة = أيام الشهر 1–31.
 * العدّ حسب تاريخ الإنشاء بتوقيت مكة ضمن البلاغات الممرّرة (الفلتر يطبّق على الاستعلام).
 */
export function buildMonthlyTicketDensityRows(rows: ReportTicketRow[]): string[][] {
  const dayHeaders = Array.from({ length: 31 }, (_, i) => String(i + 1));
  const header = ["المنطقة", ...dayHeaders];
  const byZone = new Map<string, number[]>();
  for (const r of rows) {
    const z = zoneName(r.zones);
    const dom = riyadhDayOfMonth(r.created_at);
    if (dom < 1 || dom > 31) continue;
    const arr = byZone.get(z) ?? Array.from({ length: 31 }, () => 0);
    arr[dom - 1] += 1;
    byZone.set(z, arr);
  }
  const zones = [...byZone.keys()].sort((a, b) => {
    const sa = byZone.get(a)!.reduce((x, y) => x + y, 0);
    const sb = byZone.get(b)!.reduce((x, y) => x + y, 0);
    return sb - sa;
  });
  const body = zones.map((z) => [z, ...byZone.get(z)!.map(String)]);
  if (body.length === 0) return [header, ["—", ...Array(31).fill("0")]];
  return [header, ...body];
}

/** نسبة البلاغات المنجزة ضمن SLA (من الإنشاء حتى الإغلاق) لكل تصنيف */
export function buildSlaByCategorySheetRows(rows: ReportTicketRow[]): string[][] {
  type Acc = { finished: number; withinSla: number };
  const byCat = new Map<string, Acc>();
  for (const r of rows) {
    const cat = categoryName(r.ticket_categories);
    const cur = byCat.get(cat) ?? { finished: 0, withinSla: 0 };
    if (r.status === "finished" && r.closed_at?.trim()) {
      cur.finished += 1;
      const m = minutesBetween(r.created_at, r.closed_at);
      if (m != null && m <= REPORTS_FAST_CLOSE_SLA_MINUTES) cur.withinSla += 1;
    }
    byCat.set(cat, cur);
  }
  const header = [
    "التصنيف",
    "بلاغات منجزة",
    `ضمن SLA (≤ ${REPORTS_FAST_CLOSE_SLA_MINUTES} د من الإنشاء→الإغلاق)`,
    "نسبة الالتزام",
  ];
  const body = [...byCat.entries()]
    .filter(([, a]) => a.finished > 0)
    .sort((a, b) => b[1].finished - a[1].finished)
    .map(([cat, a]) => {
      const pct = Math.round((a.withinSla / a.finished) * 1000) / 10;
      return [cat, String(a.finished), String(a.withinSla), `${pct}%`];
    });
  if (body.length === 0) return [header, ["—", "0", "0", "—"]];
  return [header, ...body];
}

/** @deprecated للمعاينة القديمة — يُفضّل buildEliteMainDetailsRows */
export type PremiumExportRow = {
  ticketNumber: string;
  zone: string;
  technician: string;
  category: string;
  createdAt: string;
  receivedAt: string;
  closedAt: string;
  faultAgeDisplay: string;
  responseDisplay: string;
  finalStatus: string;
};

export function buildPremiumExportRows(
  rows: ReportTicketRow[],
  nowMs?: number,
  pickupSlackMinutes?: number,
): PremiumExportRow[] {
  const t = nowMs ?? Date.now();
  const slack = pickupSlackMinutes ?? DEFAULT_TICKETING_SETTINGS.pickup_threshold_minutes;
  return buildEliteMainDetailsRows(rows, t, slack).map((e) => ({
    ticketNumber: e.ticketNumber,
    zone: e.zone,
    technician: e.technician,
    category: e.category,
    createdAt: `${e.createDate} | ${e.createTime}`,
    receivedAt: e.recvDate === "—" ? "انتظار" : `${e.recvDate} | ${e.recvTime}`,
    closedAt: e.closeDate === "—" && e.closeTime === "—" ? "انتظار" : `${e.closeDate} | ${e.closeTime}`,
    faultAgeDisplay: e.faultHms,
    responseDisplay: e.responseHms,
    finalStatus: e.finalStatus,
  }));
}

export type ExportRow = PremiumExportRow;
export function buildExportRows(rows: ReportTicketRow[]): PremiumExportRow[] {
  return buildPremiumExportRows(rows);
}

/** مدة بالدقائق (للرسوم البيانية في الواجهة) */
export function formatDurationFromMinutes(min: number | null | undefined): string {
  if (min == null || !Number.isFinite(min) || min < 0) return "—";
  const rounded = Math.round(min);
  if (rounded === 0) return "0 دقيقة";
  if (rounded < 60) return `${rounded} دقيقة`;
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  if (m === 0) return `${h} ساعة`;
  return `${h} ساعة و ${m} دقيقة`;
}
