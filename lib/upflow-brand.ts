/** قيم UP FLOW الافتراضية — تُستبدل من عمودي companies عند التخصيص */
export const UP_FLOW_DEFAULT_PRIMARY = "#1e3a5f";
export const UP_FLOW_DEFAULT_ACCENT = "#ea580c";

const HEX_RE = /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$/;

/** تطبيع #RGB إلى #RRGGBB أو رفض */
export function normalizeBrandHex(input: string | null | undefined): string | null {
  if (input == null) return null;
  const t = String(input).trim();
  if (!HEX_RE.test(t)) return null;
  if (t.length === 4) {
    const r = t[1]!;
    const g = t[2]!;
    const b = t[3]!;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return t.toLowerCase();
}
