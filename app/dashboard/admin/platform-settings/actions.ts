"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePlatformAdmin } from "@/lib/auth-guards";
import { SETTINGS_KEYS, type GlobalSettingKey } from "@/lib/settings-keys";
import { DEFAULT_TICKETING_SETTINGS } from "@/lib/resolved-settings";

function defaultValueForKey(key: GlobalSettingKey): string {
  switch (key) {
    case SETTINGS_KEYS.PICKUP_THRESHOLD_MINUTES:
      return String(DEFAULT_TICKETING_SETTINGS.pickup_threshold_minutes);
    case SETTINGS_KEYS.WARNING_PERCENTAGE:
      return String(DEFAULT_TICKETING_SETTINGS.warning_percentage);
    case SETTINGS_KEYS.ENABLE_SOUND_ALERTS:
      return DEFAULT_TICKETING_SETTINGS.enable_sound_alerts ? "true" : "false";
    default:
      return "";
  }
}

export async function updateGlobalSettingAction(key: GlobalSettingKey, value: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const access = await requirePlatformAdmin();
  if (!access.ok) return { ok: false, error: "غير مصرّح" };

  const trimmed = value.trim();
  if (!trimmed) return { ok: false, error: "القيمة فارغة" };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("global_settings").update({ value: trimmed }).eq("key", key);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard/admin/platform-settings");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/tickets");
  revalidatePath("/dashboard/reports");
  return { ok: true };
}

export async function resetGlobalSettingsToDefaultsAction(): Promise<{ ok: true } | { ok: false; error: string }> {
  const access = await requirePlatformAdmin();
  if (!access.ok) return { ok: false, error: "غير مصرّح" };

  const supabase = await createSupabaseServerClient();
  const keys: GlobalSettingKey[] = [
    SETTINGS_KEYS.PICKUP_THRESHOLD_MINUTES,
    SETTINGS_KEYS.WARNING_PERCENTAGE,
    SETTINGS_KEYS.ENABLE_SOUND_ALERTS,
  ];

  for (const key of keys) {
    const { error } = await supabase.from("global_settings").update({ value: defaultValueForKey(key) }).eq("key", key);
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/dashboard/admin/platform-settings");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/tickets");
  revalidatePath("/dashboard/reports");
  return { ok: true };
}
