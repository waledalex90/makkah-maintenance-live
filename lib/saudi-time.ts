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
 * أعمار البلاغات (دقيقتان، 40 دقيقة، نافذة المتابعة) تُحسب من فرق الطابع الزمني الفعلي
 * بين `created_at` (timestamptz) والوقت الحالي — مطابق لساعة المملكة (GMT+3) لأن كلا الطرفين
 * يمثلان نفس اللحظة العالمية.
 */
export function getAgeMinutes(createdAtIso: string, nowMs: number): number {
  return Math.floor(getAgeMs(createdAtIso, nowMs) / 60_000);
}

const AR_UNITS = { day: "يوم", days: "أيام", hour: "ساعة", hours: "ساعات", minute: "دقيقة", minutes: "دقائق" };

function formatCountAr(n: number, one: string, many: string): string {
  if (n <= 0) return "";
  if (n === 1) return `1 ${one}`;
  return `${n} ${many}`;
}

/**
 * عمر نسبي: أقل من ساعة → دقائق فقط؛ من ساعة فأكثر → (أيام و ساعات و دقائق) بدون جمع الدقائق في رقم كبير.
 */
export function formatRelativeSmartAr(iso: string, nowMs: number = Date.now()): string {
  const deltaMs = getAgeMs(iso, nowMs);
  if (deltaMs < 45_000) return "الآن";
  const totalMin = Math.floor(deltaMs / 60_000);
  if (totalMin < 60) {
    if (totalMin <= 1) return "منذ دقيقة تقريباً";
    return `منذ ${totalMin} دقيقة`;
  }
  const days = Math.floor(totalMin / (24 * 60));
  const hours = Math.floor((totalMin % (24 * 60)) / 60);
  const minutes = totalMin % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(formatCountAr(days, AR_UNITS.day, AR_UNITS.days));
  if (hours > 0) parts.push(formatCountAr(hours, AR_UNITS.hour, AR_UNITS.hours));
  if (minutes > 0 || parts.length === 0) parts.push(formatCountAr(minutes, AR_UNITS.minute, AR_UNITS.minutes));
  return `منذ ${parts.join(" و")}`;
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

/** نص عمر نسبي (نفس منطق formatRelativeSmartAr) + الطابع الزمني الكامل بمكة */
export function relativeAgeLabelSaudi(createdAt: string, nowMs: number): string {
  return `${formatRelativeSmartAr(createdAt, nowMs)} · ${formatSaudiDateTime(createdAt)}`;
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
    return { expired: true, text: "انتهى العدّ المحدد لهذا الإطار" };
  }
  const m = Math.floor(remaining / 60_000);
  const s = Math.floor((remaining % 60_000) / 1000);
  return { expired: false, text: `${m} دقيقة و${s} ثانية متبقية` };
}

/**
 * متبقٍ ضمن نافذة المتابعة الزمنية (ساعة من الإنشاء) — صيغة محايدة (بدون مصطلحات عقوبة).
 */
export function remainingProcessingWindowCountdownAr(createdAtIso: string, nowMs: number): string {
  const hourMs = 60 * 60_000;
  const elapsed = getAgeMs(createdAtIso, nowMs);
  const remaining = Math.max(0, hourMs - elapsed);
  if (remaining <= 0) return "انتهت نافذة المتابعة الزمنية لهذا البلاغ";
  const totalSec = Math.floor(remaining / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m} دقيقة و${s} ثانية متبقية ضمن نافذة المتابعة الزمنية (ساعة من الإنشاء)`;
}

/** @deprecated استخدم remainingProcessingWindowCountdownAr */
export function remainingUntilOneHourDeadlineAr(createdAtIso: string, nowMs: number): string {
  return remainingProcessingWindowCountdownAr(createdAtIso, nowMs);
}
