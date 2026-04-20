import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { SETTINGS_KEYS, type GlobalSettingRow } from "@/lib/settings-keys";

export type ResolvedTicketingSettings = {
  pickup_threshold_minutes: number;
  warning_percentage: number;
  completion_deadline_minutes: number;
  enable_sound_alerts: boolean;
};

export const DEFAULT_TICKETING_SETTINGS: ResolvedTicketingSettings = {
  pickup_threshold_minutes: 2,
  warning_percentage: 0.75,
  completion_deadline_minutes: 40,
  enable_sound_alerts: true,
};

/** مفتاح React Query للإعدادات المحلولة (إبطال عند تحديث الإعدادات العالمية) */
export const RESOLVED_TICKETING_SETTINGS_QUERY_KEY = ["resolved-ticketing-settings"] as const;

function clamp(n: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** يبني كائن الإعدادات من صفوف key/value (عالمي أو دمج) */
export function parseTicketingSettingsFromMap(raw: Record<string, string | undefined>): ResolvedTicketingSettings {
  const pickup = parseFloat(raw[SETTINGS_KEYS.PICKUP_THRESHOLD_MINUTES] ?? "");
  const warn = parseFloat(raw[SETTINGS_KEYS.WARNING_PERCENTAGE] ?? "");
  const completion = parseFloat(raw[SETTINGS_KEYS.COMPLETION_DEADLINE_MINUTES] ?? "");
  const soundRaw = raw[SETTINGS_KEYS.ENABLE_SOUND_ALERTS];
  return {
    pickup_threshold_minutes: clamp(pickup, 0.5, 120, DEFAULT_TICKETING_SETTINGS.pickup_threshold_minutes),
    warning_percentage: clamp(warn, 0.05, 0.99, DEFAULT_TICKETING_SETTINGS.warning_percentage),
    completion_deadline_minutes: clamp(completion, 5, 480, DEFAULT_TICKETING_SETTINGS.completion_deadline_minutes),
    enable_sound_alerts:
      soundRaw === undefined || soundRaw === ""
        ? DEFAULT_TICKETING_SETTINGS.enable_sound_alerts
        : soundRaw === "true" || soundRaw === "1",
  };
}

function rowsToMap(rows: { key: string; value: string }[]): Record<string, string> {
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

/**
 * يقرأ الإعدادات العالمية ثم يطبّق override للشركة إن وُجد.
 * يستخدم عميل الإدارة لتجاوز تعقيدات RLS في السياقات الخاصة.
 */
export async function resolveTicketingSettings(companyId: string | null): Promise<ResolvedTicketingSettings> {
  const admin = createSupabaseAdminClient();
  const { data: globals, error: gErr } = await admin.from("global_settings").select("key, value");
  if (gErr) {
    console.error("[resolved-settings] global_settings", gErr.message);
    return DEFAULT_TICKETING_SETTINGS;
  }
  const merged: Record<string, string> = rowsToMap((globals ?? []) as { key: string; value: string }[]);

  if (companyId) {
    const { data: overrides } = await admin
      .from("company_settings")
      .select("key, value")
      .eq("company_id", companyId);
    for (const row of overrides ?? []) {
      merged[row.key] = row.value;
    }
  }

  return parseTicketingSettingsFromMap(merged);
}

export function mapRowsToGlobalList(rows: GlobalSettingRow[] | null | undefined): GlobalSettingRow[] {
  return (rows ?? []).map((r) => ({
    key: r.key,
    value: r.value,
    description: r.description,
    type: r.type as GlobalSettingRow["type"],
    category: r.category,
    updated_at: r.updated_at,
  }));
}
