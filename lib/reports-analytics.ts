import type { TicketStatus } from "@/lib/ticket-status";

export type ZoneJoin = { name: string } | { name: string }[] | null;
export type CategoryJoin = { name: string } | { name: string }[] | null;
export type ProfileJoin = { full_name: string } | { full_name: string }[] | null;

export type ReportTicketRow = {
  id: string;
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
  "id, ticket_number, external_ticket_number, status, created_at, received_at, closed_at, zone_id, category_id, assigned_technician_id, assigned_engineer_id, assigned_supervisor_id, " +
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

export function riyadhDateKey(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });
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

export type ExportRow = {
  ticketNumber: string;
  zone: string;
  technician: string;
  createdAt: string;
  receivedAt: string;
  closedAt: string;
  faultAgeMinutes: string;
  responseMinutes: string;
};

export function buildExportRows(rows: ReportTicketRow[]): ExportRow[] {
  return rows.map((r) => {
    const faultAge =
      r.closed_at != null ? minutesBetween(r.created_at, r.closed_at) : minutesBetween(r.created_at, new Date().toISOString());
    const response = minutesBetween(r.created_at, r.received_at);
    return {
      ticketNumber: ticketDisplayNumber(r),
      zone: zoneName(r.zones),
      technician: technicianLabel(r),
      createdAt: r.created_at,
      receivedAt: r.received_at ?? "",
      closedAt: r.closed_at ?? "",
      faultAgeMinutes: faultAge != null ? String(faultAge) : "",
      responseMinutes: response != null ? String(response) : "",
    };
  });
}
