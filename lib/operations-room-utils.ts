export type ZoneOpsCounts = { active: number; warning: number; late: number; finished: number };

export const PICKUP_SLACK_MINUTES = 2;

/** تجميع بلاغات المناطق: نشطة (قبل 75% من مهلة الاستلام)، أوشكت (75–100%)، متأخرة، منتهية */
export function aggregateTicketsByZone(
  rows: { zone_id: string | null; status: string; created_at: string }[],
  zoneIds: string[],
  nowMs: number,
): Map<string, ZoneOpsCounts> {
  const slackMs = PICKUP_SLACK_MINUTES * 60 * 1000;
  const warnIso = new Date(nowMs - 0.75 * slackMs).toISOString();
  const lateIso = new Date(nowMs - slackMs).toISOString();
  const byZone = new Map<string, ZoneOpsCounts>();
  for (const id of zoneIds) {
    byZone.set(id, { active: 0, warning: 0, late: 0, finished: 0 });
  }
  for (const row of rows) {
    const zid = row.zone_id;
    if (!zid || !byZone.has(zid)) continue;
    const b = byZone.get(zid)!;
    if (row.status === "finished") {
      b.finished++;
    } else if (row.status === "received") {
      b.active++;
    } else if (row.status === "not_received") {
      if (row.created_at <= lateIso) b.late++;
      else if (row.created_at <= warnIso) b.warning++;
      else b.active++;
    }
  }
  return byZone;
}

/** رابط صفحة البلاغات مع فلتر المنطقة وحالة البطاقة الإحصائية */
export function buildTicketsFilteredHref(opts: {
  zoneId?: string | null;
  /** sf: late_pickup | pickup_warning | finished | received | open */
  statCard: "late_pickup" | "pickup_warning" | "finished" | "received" | "open";
}): string {
  const p = new URLSearchParams();
  if (opts.zoneId && opts.zoneId !== "all") p.set("zf", opts.zoneId);
  if (opts.statCard === "late_pickup") {
    p.set("sf", "late_pickup");
    p.set("tst", "all");
  } else if (opts.statCard === "pickup_warning") {
    p.set("sf", "pickup_warning");
    p.set("tst", "all");
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

export function playOperationsAlertSound(): void {
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
