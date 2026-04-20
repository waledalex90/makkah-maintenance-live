import type { ResolvedTicketingSettings } from "@/lib/resolved-settings";

/** صف يُجمع لكل منطقة — يحتاج received_at/updated_at لمسار الإنجاز */
export type ZoneAggregationRow = {
  id: string;
  zone_id: string | null;
  status: string;
  created_at: string;
  received_at?: string | null;
  updated_at?: string | null;
};

/** عدّادات منفصلة: مسار الاستلام (لم يُستلم) ومسار الإنجاز (تم الاستلام) */
export type ZoneOpsCounts = {
  pickup_active: number;
  pickup_warning: number;
  pickup_late: number;
  completion_active: number;
  completion_warning: number;
  completion_late: number;
  finished: number;
};

/** قيم احتياطية متوافقة مع الداتابيز عند عدم توفر الإعدادات */
export const FALLBACK_TICKET_TIMING: Pick<
  ResolvedTicketingSettings,
  "pickup_threshold_minutes" | "warning_percentage" | "completion_deadline_minutes"
> = {
  pickup_threshold_minutes: 2,
  warning_percentage: 0.75,
  completion_deadline_minutes: 40,
};

function emptyZoneCounts(): ZoneOpsCounts {
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

/** مرجع زمني لبلاغ «تم الاستلام» لحساب مهلة الإنجاز */
function receivedRefIso(row: ZoneAggregationRow): string {
  const r = row.received_at?.trim();
  if (r) return r;
  const u = row.updated_at?.trim();
  if (u) return u;
  return row.created_at;
}

/**
 * تجميع بلاغات المناطق: مساران مستقلان.
 * - الاستلام: من created_at مقابل مهلة الاستلام.
 * - الإنجاز: من received_at (أو البديل) مقابل مهلة الإنجاز.
 */
export function aggregateTicketsByZone(
  rows: ZoneAggregationRow[],
  zoneIds: string[],
  nowMs: number,
  timing: Pick<
    ResolvedTicketingSettings,
    "pickup_threshold_minutes" | "warning_percentage" | "completion_deadline_minutes"
  >,
): Map<string, ZoneOpsCounts> {
  const pickupSlackMs = timing.pickup_threshold_minutes * 60 * 1000;
  const pickupWarnIso = new Date(nowMs - timing.warning_percentage * pickupSlackMs).toISOString();
  const pickupLateIso = new Date(nowMs - pickupSlackMs).toISOString();

  const compSlackMs = timing.completion_deadline_minutes * 60 * 1000;
  const compWarnIso = new Date(nowMs - timing.warning_percentage * compSlackMs).toISOString();
  const compLateIso = new Date(nowMs - compSlackMs).toISOString();

  const byZone = new Map<string, ZoneOpsCounts>();
  for (const id of zoneIds) {
    byZone.set(id, emptyZoneCounts());
  }

  for (const row of rows) {
    const zid = row.zone_id;
    if (!zid || !byZone.has(zid)) continue;
    const b = byZone.get(zid)!;

    if (row.status === "finished") {
      b.finished++;
      continue;
    }

    if (row.status === "not_received") {
      if (row.created_at <= pickupLateIso) b.pickup_late++;
      else if (row.created_at <= pickupWarnIso) b.pickup_warning++;
      else b.pickup_active++;
      continue;
    }

    if (row.status === "received") {
      const ref = receivedRefIso(row);
      if (ref <= compLateIso) b.completion_late++;
      else if (ref <= compWarnIso) b.completion_warning++;
      else b.completion_active++;
      continue;
    }

    /* حالات أخرى نادرة: نحسبها ضمن «نشط» استلام */
    b.pickup_active++;
  }

  return byZone;
}

/** رابط صفحة البلاغات مع فلتر المنطقة وحالة البطاقة الإحصائية */
export function buildTicketsFilteredHref(opts: {
  zoneId?: string | null;
  statCard:
    | "late_pickup"
    | "pickup_warning"
    | "pickup_open"
    | "completion_late"
    | "completion_warning"
    | "completion_open"
    | "finished"
    | "received"
    | "open";
}): string {
  const p = new URLSearchParams();
  if (opts.zoneId && opts.zoneId !== "all") p.set("zf", opts.zoneId);
  if (opts.statCard === "late_pickup") {
    p.set("sf", "late_pickup");
    p.set("tst", "all");
  } else if (opts.statCard === "pickup_warning") {
    p.set("sf", "pickup_warning");
    p.set("tst", "all");
  } else if (opts.statCard === "pickup_open") {
    p.set("sf", "pickup_open");
    p.set("tst", "all");
  } else if (opts.statCard === "completion_late") {
    p.set("sf", "completion_late");
    p.set("tst", "received");
  } else if (opts.statCard === "completion_warning") {
    p.set("sf", "completion_warning");
    p.set("tst", "received");
  } else if (opts.statCard === "completion_open") {
    p.set("sf", "completion_open");
    p.set("tst", "received");
  } else if (opts.statCard === "finished") {
    p.set("sf", "finished");
    p.set("tst", "finished");
  } else if (opts.statCard === "received") {
    p.set("sf", "received");
    p.set("tst", "received");
  } else if (opts.statCard === "open") {
    p.set("sf", "open");
    p.set("tst", "all");
  }
  const qs = p.toString();
  return qs ? `/dashboard/tickets?${qs}` : "/dashboard/tickets";
}

export function playOperationsAlertSound(enabled = true): void {
  if (!enabled) return;
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.value = 0.07;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    window.setTimeout(() => {
      osc.stop();
      ctx.close().catch(() => {});
    }, 140);
  } catch {
    // ignore
  }
}
