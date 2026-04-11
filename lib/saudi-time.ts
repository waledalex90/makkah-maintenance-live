/** توقيت السعودية (مكة) لعرض المقارنات والنصوص الزمنية */

export const RIYADH_TZ = "Asia/Riyadh";

/** وصف عربي للتذييل */
export const RIYADH_TZ_LABEL_AR = "مكة المكرمة (GMT+٣)";

export function getAgeMs(createdAtIso: string, nowMs: number): number {
  return Math.max(0, nowMs - new Date(createdAtIso).getTime());
}

/**
 * دقائق عمر البلاغ من لحظة الإنشاء حتى «الآن».
 * أعمار البلاغات (دقيقتان، 40 دقيقة، مهلة الساعة) تُحسب من فرق الطابع الزمني الفعلي
 * بين `created_at` (timestamptz) والوقت الحالي — مطابق لساعة المملكة (GMT+3) لأن كلا الطرفين
 * يمثلان نفس اللحظة العالمية.
 */
export function getAgeMinutes(createdAtIso: string, nowMs: number): number {
  return Math.floor(getAgeMs(createdAtIso, nowMs) / 60_000);
}

/** عرض تاريخ ووقت بتوقيت مكة */
export function formatSaudiDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat("ar-SA", {
      timeZone: RIYADH_TZ,
      dateStyle: "medium",
      timeStyle: "short",
      numberingSystem: "latn",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/** عرض الوقت الحالي بتوقيت مكة (للمرجع) */
export function formatSaudiNow(nowMs: number): string {
  return new Intl.DateTimeFormat("ar-SA", {
    timeZone: RIYADH_TZ,
    dateStyle: "medium",
    timeStyle: "medium",
    numberingSystem: "latn",
  }).format(new Date(nowMs));
}

/** نص عمر نسبي + الطابع الزمني بمكة */
export function relativeAgeLabelSaudi(createdAt: string, nowMs: number): string {
  const deltaMs = getAgeMs(createdAt, nowMs);
  const minutes = Math.floor(deltaMs / 60_000);
  let rel: string;
  if (minutes < 1) rel = "الآن";
  else if (minutes < 60) rel = `منذ ${minutes} دقيقة`;
  else if (minutes < 24 * 60) {
    const hours = Math.floor(minutes / 60);
    rel = `منذ ${hours} ساعة`;
  } else {
    const days = Math.floor(minutes / (24 * 60));
    rel = `منذ ${days} يومًا`;
  }
  return `${rel} · ${formatSaudiDateTime(createdAt)}`;
}

/** عد تنازلي حتى حد زمني (بالدقائق) من لحظة الإنشاء */
export function countdownToMinutesFromCreatedAr(
  createdAtIso: string,
  nowMs: number,
  limitMinutes: number,
): { expired: boolean; text: string } {
  const limitMs = limitMinutes * 60_000;
  const elapsed = getAgeMs(createdAtIso, nowMs);
  const remaining = limitMs - elapsed;
  if (remaining <= 0) {
    return { expired: true, text: "انتهت المهلة الزمنية" };
  }
  const m = Math.floor(remaining / 60_000);
  const s = Math.floor((remaining % 60_000) / 1000);
  return { expired: false, text: `${m} دقيقة و${s} ثانية متبقية` };
}

/** متبقي حتى نهاية مهلة الساعة من الإنشاء (60 دقيقة) */
export function remainingUntilOneHourDeadlineAr(createdAtIso: string, nowMs: number): string {
  const hourMs = 60 * 60_000;
  const elapsed = getAgeMs(createdAtIso, nowMs);
  const remaining = Math.max(0, hourMs - elapsed);
  const m = Math.ceil(remaining / 60_000);
  if (remaining <= 0) return "انتهت مهلة الساعة";
  return `${m} دقيقة متبقية حتى نهاية مهلة الساعة`;
}
