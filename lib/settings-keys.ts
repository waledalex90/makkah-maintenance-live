/**
 * مفاتيح الإعدادات الهرمية (عالمي + override لكل شركة).
 * يُفضّل استيراد المفاتيح من هنا فقط لضمان type-safety.
 */
export const SETTINGS_KEYS = {
  PICKUP_THRESHOLD_MINUTES: "pickup_threshold_minutes",
  /** نسبة التحذير لمساري الاستلام والإنجاز (من المهلة المعنية) */
  WARNING_PERCENTAGE: "warning_percentage",
  /** مهلة الإنجاز منذ الاستلام (دقائق) لبلاغات «تم الاستلام» */
  COMPLETION_DEADLINE_MINUTES: "completion_deadline_minutes",
  ENABLE_SOUND_ALERTS: "enable_sound_alerts",
} as const;

export type GlobalSettingKey = (typeof SETTINGS_KEYS)[keyof typeof SETTINGS_KEYS];

export type SettingValueType = "string" | "number" | "boolean" | "json";

export type GlobalSettingRow = {
  key: string;
  value: string;
  description: string | null;
  type: SettingValueType;
  category: string;
  updated_at?: string;
};
