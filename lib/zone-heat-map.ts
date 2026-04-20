import type { ZoneAggregationRow } from "@/lib/operations-room-utils";

/** عتبات heat map (دقائق) — لغة بصرية مستقلة عن إعدادات المهلات في الإعدادات العالمية */
export const ZONE_HEAT = {
  /** استلام: أمان */
  pickupSafeMax: 2,
  /** استلام: تنبيه فاتح */
  pickupWarnMax: 5,
  /** إنجاز: أمان */
  completionSafeMax: 30,
  /** إنجاز: أوشك (أصفر→برتقالي) */
  completionWarnMax: 40,
} as const;

export type HeatHighlightLane = "pickup" | "completion";

export type ZoneHeatSummary = {
  /** أعلى خطورة داخل المنطقة (للترتيب والخلفية) */
  worstRank: number;
  /** بلاغات حرجة: استلام ≥5 د أو إنجاز ≥40 د */
  redBadgeCount: number;
  /** بلاغات أوشك: استلام 2–5 د أو إنجاز 30–40 د */
  yellowBadgeCount: number;
  /** أي بلاغ إنجاز متأخر يلزم نبضاً على الإطار */
  pulse: boolean;
  /** معرّف البلاغ الأكثر خطورة (للترتيب في الـ Sheet والتمييز) */
  worstTicketId: string | null;
  /** المسار الذي يضم أسوأ بلاغ (لتمييز العداد داخل الكارت) */
  highlightLane: HeatHighlightLane | null;
};

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

function receivedRefMs(row: ZoneAggregationRow): number {
  const t = row.received_at?.trim() || row.updated_at?.trim() || row.created_at;
  return new Date(t).getTime();
}

type Contribution = {
  rank: number;
  red: boolean;
  yellow: boolean;
  pulse: boolean;
  ageMin: number;
  lane: HeatHighlightLane;
  id: string;
};

function ticketContribution(row: ZoneAggregationRow, nowMs: number): Contribution | null {
  if (row.status === "finished") return null;

  if (row.status === "not_received") {
    const ageMin = (nowMs - new Date(row.created_at).getTime()) / 60_000;
    if (!Number.isFinite(ageMin)) return null;
    if (ageMin < ZONE_HEAT.pickupSafeMax) {
      return { rank: 0, red: false, yellow: false, pulse: false, ageMin, lane: "pickup", id: row.id };
    }
    if (ageMin < ZONE_HEAT.pickupWarnMax) {
      return { rank: 50, red: false, yellow: true, pulse: false, ageMin, lane: "pickup", id: row.id };
    }
    return { rank: 100, red: true, yellow: false, pulse: false, ageMin, lane: "pickup", id: row.id };
  }

  if (row.status === "received") {
    const ageMin = (nowMs - receivedRefMs(row)) / 60_000;
    if (!Number.isFinite(ageMin)) return null;
    if (ageMin < ZONE_HEAT.completionSafeMax) {
      return { rank: 8, red: false, yellow: false, pulse: false, ageMin, lane: "completion", id: row.id };
    }
    if (ageMin < ZONE_HEAT.completionWarnMax) {
      return { rank: 60, red: false, yellow: true, pulse: false, ageMin, lane: "completion", id: row.id };
    }
    return { rank: 90, red: true, yellow: false, pulse: true, ageMin, lane: "completion", id: row.id };
  }

  return null;
}

function worseContribution(a: Contribution, b: Contribution): Contribution {
  if (b.rank > a.rank) return b;
  if (b.rank < a.rank) return a;
  if (b.ageMin > a.ageMin) return b;
  return a;
}

/**
 * تجميع أسوأ حالة لكل منطقة + عدّ الشارات + تتبع أسوأ بلاغ (للتمييز والـ Sheet).
 */
export function computeZoneHeatMap(
  rows: ZoneAggregationRow[],
  zoneIds: string[],
  nowMs: number,
): Map<string, ZoneHeatSummary> {
  const map = new Map<string, ZoneHeatSummary>();
  const worstByZone = new Map<string, Contribution | null>();

  for (const id of zoneIds) {
    map.set(id, emptyHeat());
    worstByZone.set(id, null);
  }

  for (const row of rows) {
    const zid = row.zone_id;
    if (!zid || !map.has(zid)) continue;
    if (!row.id) continue;
    const t = ticketContribution(row, nowMs);
    if (!t) continue;

    const cur = map.get(zid)!;
    if (t.rank > cur.worstRank) cur.worstRank = t.rank;
    if (t.red) cur.redBadgeCount += 1;
    if (t.yellow) cur.yellowBadgeCount += 1;
    if (t.pulse) cur.pulse = true;

    const prevWorst = worstByZone.get(zid);
    if (!prevWorst) {
      worstByZone.set(zid, t);
    } else {
      worstByZone.set(zid, worseContribution(prevWorst, t));
    }
  }

  for (const id of zoneIds) {
    const cur = map.get(id)!;
    const w = worstByZone.get(id);
    if (w && w.rank >= 50) {
      cur.worstTicketId = w.id;
      cur.highlightLane = w.lane;
    }
  }

  return map;
}

/** خلفية كارت كاملة + ألوان نص أساسية (بدون نبض على كامل السطح) */
export function zoneHeatCardShellClass(heat: ZoneHeatSummary): string {
  const r = heat.worstRank;
  if (r >= 100) return "border-red-950 bg-red-950 text-white shadow-md shadow-red-950/30";
  if (r >= 90) {
    return "border-orange-500 bg-gradient-to-br from-orange-600 via-red-700 to-red-900 text-white shadow-lg shadow-orange-600/30";
  }
  if (r >= 60) return "border-amber-400 bg-gradient-to-br from-amber-100 via-amber-200 to-orange-300 text-amber-950 shadow-sm";
  if (r >= 50) return "border-red-300 bg-red-100 text-red-950 shadow-sm";
  if (r >= 8) return "border-emerald-200 bg-emerald-50/95 text-emerald-950";
  return "border-slate-200/90 bg-white text-slate-900 shadow-sm";
}

/** نبض وتوهج على الإطار فقط — خطر إنجاز ≥40 د */
export function zoneHeatCardFramePulseClass(heat: ZoneHeatSummary): string {
  if (!heat.pulse) return "";
  return "ring-2 ring-orange-300/95 ring-offset-2 ring-offset-transparent shadow-[0_0_28px_rgba(251,146,60,0.55)] animate-pulse";
}

/** نصوص وأيقونات فاتحة على الخلفيات الداكنة */
export function zoneHeatCardUseLightForeground(heat: ZoneHeatSummary): boolean {
  return heat.worstRank >= 90;
}

/** فئات Tailwind للخلفية حسب أسوأ ترتيب (صفوف مدمجة) */
export function zoneHeatRowClass(heat: ZoneHeatSummary): string {
  return zoneHeatCardShellClass(heat);
}

/** إطار بطاقة نظيف: اللون يُعرَض فقط في الإطار والشريط السفلي */
export function zoneHeatCardBorderClass(heat: ZoneHeatSummary): string {
  const r = heat.worstRank;
  if (r >= 100) return "border-red-950";
  if (r >= 90) return "border-orange-500";
  if (r >= 60) return "border-amber-400";
  if (r >= 50) return "border-red-300";
  if (r >= 8) return "border-emerald-300";
  return "border-slate-200";
}

/** شريط ملون سفلي حسب أسوأ حالة (نفس تدرجات الـ heat map) */
export function zoneHeatStripClass(heat: ZoneHeatSummary): string {
  const r = heat.worstRank;
  if (r >= 100) return "bg-red-950";
  if (r >= 90) {
    return heat.pulse
      ? "bg-gradient-to-l from-orange-600 to-red-700 animate-pulse shadow-[0_0_12px_rgba(251,146,60,0.65)]"
      : "bg-gradient-to-l from-orange-600 to-red-700";
  }
  if (r >= 60) return "bg-gradient-to-l from-amber-300 via-amber-400 to-orange-500";
  if (r >= 50) return "bg-red-300";
  if (r >= 8) return "bg-emerald-500";
  return "bg-slate-200";
}
