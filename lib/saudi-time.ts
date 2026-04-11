/** توقيت السعودية (مكة) لعرض المقارنات والنصوص الزمنية */

export const RIYADH_TZ = "Asia/Riyadh";

/** وصف عربي للتذييل */
export const RIYADH_TZ_LABEL_AR = "مكة المكرمة (GMT+٣)";

/** تاريخ + وقت كامل بالثواني (مثال: ٢‏/٤‏/٢٠٢٦، ٢:٣٠:٤٥ م) بتوقيت مكة */
const SAUDI_DATE_TIME_OPTS: Intl.DateTimeFormatOptions = {
  timeZone: RIYADH_TZ,
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: true,
  numberingSystem: "latn",
};

/** ساعة فقط بالثواني بتوقيت مكة (نفس الصيغة 12 ساعة مع ص/م) */
const SAUDI_TIME_OPTS: Intl.DateTimeFormatOptions = {
  timeZone: RIYADH_TZ,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: true,
  numberingSystem: "latn",
};

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

/** عرض تاريخ ووقت بتوقيت مكة — يشمل الثواني */
export function formatSaudiDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat("ar-SA", SAUDI_DATE_TIME_OPTS).format(new Date(iso));
  } catch {
    return iso;
  }
}

/** عرض الوقت الحالي بتوقيت مكة (للمرجع) — يشمل الثواني */
export function formatSaudiNow(nowMs: number): string {
  return formatSaudiDateTime(new Date(nowMs).toISOString());
}

/**
 * عرض الوقت فقط (ساعة:دقيقة:ثانية) بتوقيت مكة.
 * يقبل طابعًا زمنيًا (ISO) أو عدد مللي ثانية منذ الحقبة.
 */
export function formatSaudiTime(isoOrMs: string | number): string {
  try {
    const d = typeof isoOrMs === "number" ? new Date(isoOrMs) : new Date(isoOrMs);
    return new Intl.DateTimeFormat("ar-SA", SAUDI_TIME_OPTS).format(d);
  } catch {
    return String(isoOrMs);
  }
}

/** نص عمر نسبي + الطابع الزمني بمكة (يشمل الثواني في الجزء الزمني) */
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

/** عد تنازلي حتى حد زمني (بالدقائق) من لحظة الإنشاء — يعرض الدقائق والثواني المتبقية */
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

/** متبقي حتى نهاية مهلة الساعة من الإنشاء (60 دقيقة) — بالدقائق والثواني */
export function remainingUntilOneHourDeadlineAr(createdAtIso: string, nowMs: number): string {
  const hourMs = 60 * 60_000;
  const elapsed = getAgeMs(createdAtIso, nowMs);
  const remaining = Math.max(0, hourMs - elapsed);
  if (remaining <= 0) return "انتهت مهلة الساعة";
  const totalSec = Math.floor(remaining / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m} دقيقة و${s} ثانية متبقية حتى نهاية مهلة الساعة`;
}
