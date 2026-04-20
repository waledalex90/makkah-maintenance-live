"use client";

import { useMemo, useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, RotateCcw, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { GlobalSettingRow } from "@/lib/settings-keys";
import { SETTINGS_KEYS } from "@/lib/settings-keys";
import { DEFAULT_TICKETING_SETTINGS, RESOLVED_TICKETING_SETTINGS_QUERY_KEY } from "@/lib/resolved-settings";
import { resetGlobalSettingsToDefaultsAction, updateGlobalSettingAction } from "@/app/dashboard/admin/platform-settings/actions";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PLATFORM_PURGE_CONFIRMATION_PHRASE } from "@/lib/platform-purge";

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
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [purgePhrase, setPurgePhrase] = useState("");
  const [purging, setPurging] = useState(false);

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

  const runPlatformPurge = async () => {
    if (purgePhrase !== PLATFORM_PURGE_CONFIRMATION_PHRASE) {
      toast.error(`اكتب كلمة التأكيد بالضبط: ${PLATFORM_PURGE_CONFIRMATION_PHRASE}`);
      return;
    }
    setPurging(true);
    try {
      const res = await fetch("/api/platform/purge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmationPhrase: purgePhrase, databaseOnly: true }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; auth_delete_errors?: string[]; database_only?: boolean };
      if (!res.ok) {
        toast.error(json.error === "phrase_mismatch" ? "كلمة التأكيد غير صحيحة." : (json.error ?? "تعذر التنفيذ."));
        return;
      }
      if (json.auth_delete_errors?.length) {
        console.warn("[platform-purge] auth delete warnings", json.auth_delete_errors);
      }
      toast.success("تم التطهير. جاري تحديث الصفحة…");
      setPurgeOpen(false);
      setPurgePhrase("");
      window.location.reload();
    } catch {
      toast.error("تعذر الاتصال بالخادم.");
    } finally {
      setPurging(false);
    }
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
            قيم افتراضية للمنصة؛ يمكن لكل شركة لاحقاً تجاوزها من إعدادات الشركة. أي حفظ لمهلة الاستلام أو الإنجاز أو لنسبة «أوشك على
            التأخير» يُحدّث الكاش (`resolved-ticketing-settings`) ومصفوفة المناطق في غرفة العمليات فوراً بعد «حفظ».
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
                aria-describedby="completion_deadline_help"
              />
              <p id="completion_deadline_help" className="text-[11px] text-slate-600">
                تُحسب المهلة من لحظة «استلام البلاغ» (received) حتى إتمامه (إغلاق)، وتُستخدم مع نسبة التحذير لعرض «إنجاز أوشك» و«إنجاز
                متأخر» في كروت المناطق.
              </p>
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

      <Card className="border-red-200 bg-red-50/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-900">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            تطهير المنصة
          </CardTitle>
          <CardDescription className="text-red-800/90">
            يمسح الشركات وبياناتها التشغيلية عبر الخادم (دالة <span dir="ltr">platform_purge_tenant_data</span>) دون الحاجة لـ SQL. في
            وضع التجربة يُبقى حسابات المصادقة؛ للصارمية الكاملة لاحقاً يمكن إضافة حذف المستخدمين من Auth بشكل منفصل.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            className="h-12 min-w-[220px] bg-red-700 px-6 text-base font-semibold text-white shadow-md hover:bg-red-800"
            disabled={pending || purging}
            onClick={() => setPurgeOpen(true)}
          >
            <Trash2 className="h-5 w-5" aria-hidden />
            تطهير المنصة
          </Button>
        </CardContent>
      </Card>

      <Dialog
        open={purgeOpen}
        onOpenChange={(open) => {
          setPurgeOpen(open);
          if (!open) setPurgePhrase("");
        }}
      >
        <DialogContent dir="rtl" lang="ar">
          <DialogHeader>
            <DialogTitle className="text-red-900">تأكيد التطهير</DialogTitle>
            <DialogDescription className="text-slate-700">
              سيتم تنفيذ التطهير فوراً من التطبيق. للمتابعة اكتب كلمة واحدة فقط بالضبط:
              <span className="mt-2 block rounded-md bg-slate-100 px-3 py-2 text-center font-mono text-lg font-bold tracking-wide" dir="rtl">
                {PLATFORM_PURGE_CONFIRMATION_PHRASE}
              </span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="purge_phrase">كلمة التأكيد</Label>
              <Input
                id="purge_phrase"
                dir="rtl"
                autoComplete="off"
                autoFocus
                value={purgePhrase}
                onChange={(e) => setPurgePhrase(e.target.value)}
                placeholder={PLATFORM_PURGE_CONFIRMATION_PHRASE}
                className="text-center font-mono text-lg"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && purgePhrase === PLATFORM_PURGE_CONFIRMATION_PHRASE && !purging) {
                    e.preventDefault();
                    void runPlatformPurge();
                  }
                }}
              />
            </div>
            <div className="flex flex-wrap gap-2 justify-end">
              <Button type="button" variant="outline" disabled={purging} onClick={() => setPurgeOpen(false)}>
                إلغاء
              </Button>
              <Button
                type="button"
                className="bg-red-700 text-white hover:bg-red-800"
                disabled={purging || purgePhrase !== PLATFORM_PURGE_CONFIRMATION_PHRASE}
                onClick={() => void runPlatformPurge()}
              >
                {purging ? "جاري التنفيذ…" : "تنفيذ التطهير الآن"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
