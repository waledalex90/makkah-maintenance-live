"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { isGpsSecureContext } from "@/lib/gps-permission";

const LS_KEY = "makkah_field_setup_wizard_done_v1";

const FIELD_ROLES = new Set(["technician", "supervisor", "engineer"]);

function notifGranted(): boolean {
  return typeof Notification !== "undefined" && Notification.permission === "granted";
}

async function requestGeolocationOnce(): Promise<boolean> {
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) return false;
  if (!isGpsSecureContext()) return false;
  return await new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      () => resolve(true),
      () => resolve(false),
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    );
  });
}

async function geolocationEffectivelyGranted(): Promise<boolean> {
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) return false;
  if (!isGpsSecureContext()) return false;
  if ("permissions" in navigator && navigator.permissions?.query) {
    try {
      const r = await navigator.permissions.query({ name: "geolocation" });
      if (r.state === "granted") return true;
      if (r.state === "denied") return false;
    } catch {
      /* fall through to probe */
    }
  }
  return requestGeolocationOnce();
}

export function FieldSetupWizardGate() {
  const pathname = usePathname() ?? "";
  const [gate, setGate] = useState<"unknown" | "show" | "hide">("unknown");
  const [busy, setBusy] = useState(false);

  const skip = useMemo(() => {
    if (!pathname) return true;
    if (pathname === "/login" || pathname.startsWith("/login")) return true;
    if (pathname === "/update-password" || pathname.startsWith("/update-password")) return true;
    return false;
  }, [pathname]);

  const evaluate = useCallback(async () => {
    if (skip) {
      setGate("hide");
      return;
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setGate("hide");
      return;
    }

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("role, access_work_list, has_completed_setup")
      .eq("id", user.id)
      .maybeSingle();

    if (error || !profile) {
      setGate("hide");
      return;
    }

    const role = profile.role as string;
    const needsWizard = FIELD_ROLES.has(role) || Boolean(profile.access_work_list);
    if (!needsWizard) {
      setGate("hide");
      return;
    }

    let lsDone = false;
    try {
      lsDone = window.localStorage.getItem(LS_KEY) === "1";
    } catch {
      lsDone = false;
    }

    const dbDone = Boolean((profile as { has_completed_setup?: boolean }).has_completed_setup);
    const wizardDone = lsDone || dbDone;

    const nOk = notifGranted();
    const gOk = await geolocationEffectivelyGranted();

    if (wizardDone && nOk && gOk) {
      setGate("hide");
      return;
    }

    setGate("show");
  }, [skip]);

  useEffect(() => {
    void evaluate();
  }, [evaluate, pathname]);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void evaluate();
    });
    return () => subscription.unsubscribe();
  }, [evaluate]);

  useEffect(() => {
    if (gate !== "show") return;
    const id = window.setInterval(() => void evaluate(), 5000);
    return () => window.clearInterval(id);
  }, [gate, evaluate]);

  const onSetup = async () => {
    setBusy(true);
    try {
      let nOk = notifGranted();
      if ("Notification" in window && Notification.permission === "default") {
        const r = await Notification.requestPermission();
        nOk = r === "granted";
      }

      const gOk = await requestGeolocationOnce();

      if ("vibrate" in navigator && navigator.vibrate) {
        try {
          navigator.vibrate([120, 60, 120]);
        } catch {
          /* ignore */
        }
      }

      if (!nOk || !gOk) {
        toast.warning("لم تُقبَل كل الصلاحيات. يلزم تفعيل الإشعارات والموقع لإكمال الإعداد.", { duration: 8000 });
        await evaluate();
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        toast.error("لا توجد جلسة صالحة.");
        return;
      }

      const { error: upErr } = await supabase.from("profiles").update({ has_completed_setup: true }).eq("id", user.id);
      if (upErr) {
        toast.error(upErr.message);
        return;
      }

      try {
        window.localStorage.setItem(LS_KEY, "1");
      } catch {
        /* ignore */
      }

      toast.success("تم إعداد نظام الميدان بنجاح.");
      await evaluate();
    } finally {
      setBusy(false);
    }
  };

  if (gate !== "show") return null;

  return (
    <div
      className="fixed inset-0 z-[100000] flex flex-col items-center justify-center gap-6 bg-slate-950/[0.97] p-6 text-center text-white"
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="field-setup-wizard-title"
    >
      <div className="max-w-md space-y-3">
        <h1 id="field-setup-wizard-title" className="text-xl font-bold sm:text-2xl">
          إعداد نظام الميدان (مرة واحدة)
        </h1>
        <p className="text-sm leading-relaxed text-slate-300">
          لضمان التنبيهات اللحظية وتتبع الموقع في الميدان، يلزم تفعيل{" "}
          <span className="font-semibold text-white">إشعارات المتصفح</span> و{" "}
          <span className="font-semibold text-white">صلاحية الموقع</span>. لا يمكن استخدام النظام قبل إكمال هذه
          الخطوة.
        </p>
      </div>
      <Button
        type="button"
        className="h-14 min-w-[min(100%,320px)] max-w-md px-8 text-base font-bold shadow-lg sm:text-lg"
        disabled={busy}
        onClick={() => void onSetup()}
      >
        {busy ? "جاري الطلب..." : "إعداد وتفعيل نظام الميدان"}
      </Button>
    </div>
  );
}
