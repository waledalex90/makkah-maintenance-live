"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ensureGpsPermission, isGpsSecureContext } from "@/lib/gps-permission";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "makkah_field_perms_welcome_v1";

const FIELD_ROLES = new Set(["technician", "supervisor", "engineer"]);

type Props = {
  role: string;
};

export function FieldStaffPermissionsOnboarding({ role }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!FIELD_ROLES.has(role)) return;
    try {
      if (typeof window !== "undefined" && window.localStorage.getItem(STORAGE_KEY)) return;
    } catch {
      /* ignore */
    }
    const t = window.setTimeout(() => setOpen(true), 450);
    return () => window.clearTimeout(t);
  }, [role]);

  const finish = useCallback((mode: "completed" | "dismissed") => {
    try {
      window.localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      /* ignore */
    }
    setOpen(false);
  }, []);

  const requestPermissions = useCallback(async () => {
    setBusy(true);
    let gpsGranted = false;
    let cameraGranted = false;

    const perm = await ensureGpsPermission();
    if (perm === "insecure") {
      toast.error("التطبيق يحتاج اتصالاً آمناً (HTTPS) لتفعيل الموقع.");
    } else if (perm === "unsupported") {
      toast.error("المتصفح لا يدعم تحديد الموقع على هذا الجهاز.");
    } else if (isGpsSecureContext() && "geolocation" in navigator) {
      try {
        await new Promise<void>((resolve) => {
          navigator.geolocation.getCurrentPosition(
            () => {
              gpsGranted = true;
              resolve();
            },
            () => resolve(),
            { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
          );
        });
      } catch {
        /* ignore */
      }
    }

    if (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        stream.getTracks().forEach((track) => track.stop());
        cameraGranted = true;
      } catch {
        cameraGranted = false;
      }
    }

    setBusy(false);
    finish("completed");

    if (!gpsGranted || !cameraGranted) {
      toast.warning(
        "لم تُفعَّل كل الصلاحيات. لن يعمل التطبيق بكفاءة كاملة دون الموقع والكاميرا لتتبع المهام وتوثيق البلاغات. يمكنك تفعيلها لاحقاً من إعدادات المتصفح أو الجهاز.",
        { duration: 9000 },
      );
    } else {
      toast.success("تم تفعيل الصلاحيات. شكراً لك.");
    }
  }, [finish]);

  const onDismiss = useCallback(() => {
    finish("dismissed");
    toast.info("يمكنك تفعيل الموقع والكاميرا لاحقاً من إعدادات المتصفح. بدونها قد لا يعمل التتبع والتوثيق بشكل مثالي.", {
      duration: 7000,
    });
  }, [finish]);

  if (!open || !FIELD_ROLES.has(role)) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/45 p-3 pb-8 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="field-perms-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <h2 id="field-perms-title" className="text-lg font-bold text-slate-900 dark:text-slate-50">
          صلاحيات مطلوبة
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          مشروع مكة يتطلب صلاحيات الموقع والكاميرا لتوثيق البلاغات ومتابعة المهام.
        </p>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          عند الرفض، قد لا يعمل التتبع الميداني أو رفع صور التوثيق كما يجب. يُنصح بالموافقة الآن.
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" className="w-full sm:w-auto" disabled={busy} onClick={onDismiss}>
            لاحقاً
          </Button>
          <Button type="button" className="w-full sm:w-auto" disabled={busy} onClick={() => void requestPermissions()}>
            {busy ? "جاري الطلب..." : "تفعيل الصلاحيات"}
          </Button>
        </div>
      </div>
    </div>
  );
}
