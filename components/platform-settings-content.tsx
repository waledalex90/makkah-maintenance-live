"use client";

import { useMemo, useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { GlobalSettingRow } from "@/lib/settings-keys";
import { SETTINGS_KEYS } from "@/lib/settings-keys";
import { DEFAULT_TICKETING_SETTINGS, RESOLVED_TICKETING_SETTINGS_QUERY_KEY } from "@/lib/resolved-settings";
import { resetGlobalSettingsToDefaultsAction, updateGlobalSettingAction } from "@/app/dashboard/admin/platform-settings/actions";

type Props = {
  initialRows: GlobalSettingRow[];
};

function rowMap(rows: GlobalSettingRow[]): Map<string, GlobalSettingRow> {
  return new Map(rows.map((r) => [r.key, r]));
}

export function PlatformSettingsContent({ initialRows }: Props) {
  const queryClient = useQueryClient();
  const [pending, startTransition] = useTransition();
  const byKey = useMemo(() => rowMap(initialRows), [initialRows]);

  const pickupRow = byKey.get(SETTINGS_KEYS.PICKUP_THRESHOLD_MINUTES);
  const warnRow = byKey.get(SETTINGS_KEYS.WARNING_PERCENTAGE);
  const completionRow = byKey.get(SETTINGS_KEYS.COMPLETION_DEADLINE_MINUTES);
  const soundRow = byKey.get(SETTINGS_KEYS.ENABLE_SOUND_ALERTS);

  const initialPickup = pickupRow ? parseFloat(pickupRow.value) || DEFAULT_TICKETING_SETTINGS.pickup_threshold_minutes : DEFAULT_TICKETING_SETTINGS.pickup_threshold_minutes;
  const initialWarnRatio = warnRow ? parseFloat(warnRow.value) || DEFAULT_TICKETING_SETTINGS.warning_percentage : DEFAULT_TICKETING_SETTINGS.warning_percentage;
  const initialCompletion =
    completionRow ? parseFloat(completionRow.value) || DEFAULT_TICKETING_SETTINGS.completion_deadline_minutes : DEFAULT_TICKETING_SETTINGS.completion_deadline_minutes;
  const initialSound =
    soundRow?.value === undefined || soundRow.value === ""
      ? DEFAULT_TICKETING_SETTINGS.enable_sound_alerts
      : soundRow.value === "true" || soundRow.value === "1";

  const [pickupMin, setPickupMin] = useState(String(initialPickup));
  const [warnPercent, setWarnPercent] = useState(String(Math.round(initialWarnRatio * 100)));
  const [completionMin, setCompletionMin] = useState(String(initialCompletion));
  const [sound, setSound] = useState(initialSound);

  const invalidateResolved = () => {
    void queryClient.invalidateQueries({ queryKey: [...RESOLVED_TICKETING_SETTINGS_QUERY_KEY] });
  };

  const saveKey = (key: typeof SETTINGS_KEYS[keyof typeof SETTINGS_KEYS], value: string) => {
    startTransition(async () => {
      const res = await updateGlobalSettingAction(key, value);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("تم حفظ الإعداد.");
      invalidateResolved();
    });
  };

  const onSavePickup = () => {
    const n = parseFloat(pickupMin.replace(",", "."));
    if (!Number.isFinite(n) || n < 0.5 || n > 120) {
      toast.error("أدخل مهلة صحيحة بين 0.5 و 120 دقيقة.");
      return;
    }
    saveKey(SETTINGS_KEYS.PICKUP_THRESHOLD_MINUTES, String(n));
  };

  const onSaveWarn = () => {
    const p = parseFloat(warnPercent.replace(",", "."));
    if (!Number.isFinite(p) || p < 5 || p > 99) {
      toast.error("أدخل نسبة بين 5% و 99%.");
      return;
    }
    const ratio = p / 100;
    saveKey(SETTINGS_KEYS.WARNING_PERCENTAGE, String(ratio));
  };

  const onSaveCompletion = () => {
    const n = parseFloat(completionMin.replace(",", "."));
    if (!Number.isFinite(n) || n < 5 || n > 480) {
      toast.error("أدخل مهلة إنجاز بين 5 و 480 دقيقة.");
      return;
    }
    saveKey(SETTINGS_KEYS.COMPLETION_DEADLINE_MINUTES, String(n));
  };

  const onToggleSound = (checked: boolean) => {
    setSound(checked);
    saveKey(SETTINGS_KEYS.ENABLE_SOUND_ALERTS, checked ? "true" : "false");
  };

  const onReset = () => {
    startTransition(async () => {
      const res = await resetGlobalSettingsToDefaultsAction();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("تمت استعادة القيم الافتراضية.");
      setPickupMin(String(DEFAULT_TICKETING_SETTINGS.pickup_threshold_minutes));
      setWarnPercent(String(Math.round(DEFAULT_TICKETING_SETTINGS.warning_percentage * 100)));
      setCompletionMin(String(DEFAULT_TICKETING_SETTINGS.completion_deadline_minutes));
      setSound(DEFAULT_TICKETING_SETTINGS.enable_sound_alerts);
      invalidateResolved();
    });
  };

  return (
    <div className="space-y-6" dir="rtl" lang="ar">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">الإعدادات العالمية</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            قيم افتراضية للمنصة؛ يمكن لكل شركة لاحقاً تجاوزها من إعدادات الشركة.             أي حفظ لمهلة الاستلام أو الإنجاز أو لنسبة «أوشك على التأخير» يُحدّث مصفوفة المناطق وتنبيهات غرفة العمليات فوراً
            (بعد الضغط على حفظ).
          </p>
        </div>
        <Button type="button" variant="outline" className="gap-2" disabled={pending} onClick={onReset}>
          <RotateCcw className="h-4 w-4" />
          استعادة الافتراضيات
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>غرفة العمليات والبلاغات</CardTitle>
          <CardDescription>{pickupRow?.category === "ticketing" ? "تصنيف: ticketing" : "مفاتيح التوقيت والتنبيهات"}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          <div className="grid gap-4 sm:grid-cols-2 sm:items-end">
            <div className="space-y-2">
              <Label htmlFor="pickup_threshold">مهلة الاستلام الافتراضية (بالدقائق)</Label>
              <p className="text-[11px] font-medium text-slate-600">Default Pickup Threshold Minutes</p>
              <p className="text-xs text-slate-500">
                {pickupRow?.description ?? "الحد الزمني قبل اعتبار البلاغ متأخراً في الاستلام؛ يُضرب في نسبة التحذير أدناه لتحديد بداية حالة «أوشك»."}
              </p>
              <Input
                id="pickup_threshold"
                inputMode="decimal"
                value={pickupMin}
                onChange={(e) => setPickupMin(e.target.value)}
                className="max-w-xs"
                aria-describedby="pickup_threshold_help"
              />
              <p id="pickup_threshold_help" className="text-[11px] text-slate-500">
                في غرفة العمليات: زمن بداية التنبيه الأصفر = نسبة «أوشك» × هذه المهلة (بالدقائق).
              </p>
            </div>
            <Button type="button" className="gap-2 sm:w-fit" disabled={pending} onClick={onSavePickup}>
              <Save className="h-4 w-4" />
              حفظ
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 sm:items-end">
            <div className="space-y-2">
              <Label htmlFor="warning_pct">نسبة «أوشك على التأخير» (%)</Label>
              <p className="text-xs text-slate-500">{warnRow?.description ?? "من مهلة الاستلام قبل اعتبار البلاغ في حالة التحذير."}</p>
              <Input
                id="warning_pct"
                inputMode="numeric"
                value={warnPercent}
                onChange={(e) => setWarnPercent(e.target.value)}
                className="max-w-xs"
                aria-describedby="warning_pct_hint"
              />
              <p id="warning_pct_hint" className="text-[11px] text-slate-600">
                يتم احتساب التنبيه بناءً على مهلة الاستلام المحددة أعلاه.
              </p>
              <p className="text-[11px] text-slate-500">
                نفس النسبة تُطبَّق على مسار الإنجاز مع «مهلة الإنجاز الافتراضية» أدناه (منذ وقت الاستلام).
              </p>
            </div>
            <Button type="button" className="gap-2 sm:w-fit" disabled={pending} onClick={onSaveWarn}>
              <Save className="h-4 w-4" />
              حفظ
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 sm:items-end">
            <div className="space-y-2">
              <Label htmlFor="completion_deadline">مهلة الإنجاز الافتراضية (بالدقائق)</Label>
              <p className="text-[11px] font-medium text-slate-600">Default Completion Deadline Minutes</p>
              <p className="text-xs text-slate-500">
                {completionRow?.description ??
                  "منذ استلام البلاغ لاعتبار التنفيذ متأخراً؛ تُضرب نسبة التحذير أعلاه في هذه المهلة لحالة «أوشك إنجاز»."}
              </p>
              <Input
                id="completion_deadline"
                inputMode="numeric"
                value={completionMin}
                onChange={(e) => setCompletionMin(e.target.value)}
                className="max-w-xs"
              />
            </div>
            <Button type="button" className="gap-2 sm:w-fit" disabled={pending} onClick={onSaveCompletion}>
              <Save className="h-4 w-4" />
              حفظ
            </Button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-slate-200 bg-slate-50/80 p-4">
            <div>
              <Label htmlFor="sound_alerts" className="text-base">
                تنبيهات صوتية في غرفة العمليات
              </Label>
              <p className="mt-1 text-xs text-slate-500">{soundRow?.description ?? "عند زيادة البلاغات المتأخرة أو في حالة التحذير."}</p>
            </div>
            <input
              id="sound_alerts"
              type="checkbox"
              className="h-5 w-5 rounded border-slate-300 accent-slate-900"
              checked={sound}
              disabled={pending}
              onChange={(e) => onToggleSound(e.target.checked)}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
