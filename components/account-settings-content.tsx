"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const ALERT_SOUND_STORAGE_KEY = "ops_alert_sounds_enabled";
const THEME_MODE_STORAGE_KEY = "ops_theme_mode";

export function AccountSettingsContent() {
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [fullName, setFullName] = useState("");
  const [mobile, setMobile] = useState("");
  const [alertsEnabled, setAlertsEnabled] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [profileRole, setProfileRole] = useState<string | null>(null);
  const [testNotifyPending, setTestNotifyPending] = useState(false);
  const [billingLoading, setBillingLoading] = useState(true);
  const [billing, setBilling] = useState<{
    plan_name: string;
    plan_key: string;
    price_monthly: number;
    limits: { technicians: number | null; tickets_per_month: number | null; zones: number | null };
    usage: { technicians: number; tickets_this_month: number; zones: number };
  } | null>(null);
  const [invoices, setInvoices] = useState<
    Array<{ id: string; invoice_number?: string | null; amount: number; currency: string; invoice_status: string; period_start: string; period_end: string }>
  >([]);
  const [plans, setPlans] = useState<
    Array<{ plan_key: string; display_name: string; price_monthly: number; max_technicians: number | null; max_tickets_per_month: number | null; max_zones: number | null }>
  >([]);
  const [selectedPlan, setSelectedPlan] = useState<string>("");
  const [payingInvoiceId, setPayingInvoiceId] = useState<string | null>(null);
  const [upgradingPlan, setUpgradingPlan] = useState(false);
  const [notifications, setNotifications] = useState<
    Array<{ id: string; title: string; body: string; created_at: string; notification_type: string }>
  >([]);

  const loadBillingData = async () => {
    const res = await fetch("/api/company/billing-summary", { cache: "no-store" });
    const json = (await res.json()) as { ok?: boolean; billing?: typeof billing; error?: string };
    if (res.ok && json.ok && json.billing) {
      setBilling(json.billing);
      setSelectedPlan(json.billing.plan_key);
    }

    const invoicesRes = await fetch("/api/company/invoices", { cache: "no-store" });
    const invoicesJson = (await invoicesRes.json()) as {
      ok?: boolean;
      invoices?: Array<{ id: string; invoice_number?: string | null; amount: number; currency: string; invoice_status: string; period_start: string; period_end: string }>;
    };
    if (invoicesRes.ok && invoicesJson.ok && invoicesJson.invoices) {
      setInvoices(invoicesJson.invoices);
    }
  };

  useEffect(() => {
    const savedAlerts = window.localStorage.getItem(ALERT_SOUND_STORAGE_KEY);
    setAlertsEnabled(savedAlerts !== "false");

    const savedTheme = window.localStorage.getItem(THEME_MODE_STORAGE_KEY);
    const dark = savedTheme === "dark";
    setIsDarkMode(dark);
    document.documentElement.classList.toggle("dark", dark);
  }, []);

  useEffect(() => {
    const loadBilling = async () => {
      try {
        await loadBillingData();
        const plansRes = await fetch("/api/company/plans", { cache: "no-store" });
        const plansJson = (await plansRes.json()) as {
          ok?: boolean;
          plans?: Array<{ plan_key: string; display_name: string; price_monthly: number; max_technicians: number | null; max_tickets_per_month: number | null; max_zones: number | null }>;
        };
        if (plansRes.ok && plansJson.ok && plansJson.plans) {
          setPlans(plansJson.plans);
        }

        const notificationsRes = await fetch("/api/company/notifications", { cache: "no-store" });
        const notificationsJson = (await notificationsRes.json()) as {
          ok?: boolean;
          notifications?: Array<{ id: string; title: string; body: string; created_at: string; notification_type: string }>;
        };
        if (notificationsRes.ok && notificationsJson.ok && notificationsJson.notifications) {
          setNotifications(notificationsJson.notifications);
        }
      } finally {
        setBillingLoading(false);
      }
    };
    void loadBilling();
  }, []);

  useEffect(() => {
    window.localStorage.setItem(ALERT_SOUND_STORAGE_KEY, alertsEnabled ? "true" : "false");
  }, [alertsEnabled]);

  useEffect(() => {
    window.localStorage.setItem(THEME_MODE_STORAGE_KEY, isDarkMode ? "dark" : "light");
    document.documentElement.classList.toggle("dark", isDarkMode);
  }, [isDarkMode]);

  useEffect(() => {
    const loadProfile = async () => {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setLoadingProfile(false);
        return;
      }

      const { data, error } = await supabase.from("profiles").select("full_name, mobile, role").eq("id", user.id).single();

      if (error) {
        toast.error(error.message);
        setLoadingProfile(false);
        return;
      }

      setFullName(data?.full_name ?? "");
      setMobile(data?.mobile ?? "");
      setProfileRole((data?.role as string | undefined) ?? null);
      setLoadingProfile(false);
    };

    void loadProfile();
  }, []);

  const saveProfile = async () => {
    const nextFullName = fullName.trim();
    const nextMobile = mobile.trim();

    if (!nextFullName || !nextMobile) {
      toast.error("يرجى تعبئة الاسم الكامل ورقم الجوال.");
      return;
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      toast.error("تعذر تحديد المستخدم الحالي.");
      return;
    }

    setSavingProfile(true);
    const { error } = await supabase.from("profiles").update({ full_name: nextFullName, mobile: nextMobile }).eq("id", user.id);
    setSavingProfile(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("تم تحديث الملف الشخصي بنجاح.");
  };

  const scheduleDelayedTestNotification = () => {
    if (!("serviceWorker" in navigator)) {
      toast.error("متصفحك لا يدعم Service Worker لهذا الاختبار.");
      return;
    }
    if (typeof Notification === "undefined" || Notification.permission !== "granted") {
      toast.error("فعّل إشعارات المتصفح من شريط العنوان ثم أعد المحاولة.");
      return;
    }
    setTestNotifyPending(true);
    toast.info("سيصل تنبيه تجريبي خلال ١٠ ثوانٍ — يمكنك إغلاق الشاشة أو التطبيق للاختبار.");
    window.setTimeout(() => {
      void navigator.serviceWorker.ready.then((reg) => {
        const tag = `admin-test-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        reg.active?.postMessage({
          type: "SHOW_NOTIFICATION",
          title: "اختبار التنبيه اللحظي",
          options: {
            body: "تنبيه وهمي بعد ١٠ ثوانٍ للتحقق من الوصول.",
            tag,
            renotify: true,
            data: { url: "/dashboard/settings" },
          },
        });
      });
      setTestNotifyPending(false);
    }, 10_000);
  };

  const startInvoicePayment = async (invoiceId: string) => {
    setPayingInvoiceId(invoiceId);
    try {
      const res = await fetch(`/api/company/invoices/${invoiceId}/checkout`, { method: "POST" });
      const json = (await res.json()) as { ok?: boolean; url?: string; error?: string };
      if (!res.ok || !json.ok || !json.url) {
        toast.error(json.error ?? "تعذر بدء عملية الدفع.");
        return;
      }
      window.location.href = json.url;
    } finally {
      setPayingInvoiceId(null);
    }
  };

  const createUpgradeAndPay = async () => {
    if (!selectedPlan) {
      toast.error("اختر الباقة أولاً.");
      return;
    }
    setUpgradingPlan(true);
    try {
      const createRes = await fetch("/api/company/billing/upgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_key: selectedPlan }),
      });
      const createJson = (await createRes.json()) as { ok?: boolean; invoice?: { id: string }; error?: string };
      if (!createRes.ok || !createJson.ok || !createJson.invoice?.id) {
        toast.error(createJson.error ?? "تعذر إنشاء فاتورة الترقية.");
        return;
      }
      await startInvoicePayment(createJson.invoice.id);
    } finally {
      setUpgradingPlan(false);
    }
  };

  return (
    <div className="space-y-4" dir="rtl" lang="ar">
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">الإعدادات</h1>
        <p className="mt-1 text-sm text-slate-500">مركز التحكم الخاص بحسابك والتنبيهات.</p>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>إعدادات التنبيهات</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <div>
              <p className="text-sm font-medium">أصوات التنبيهات</p>
              <p className="text-xs text-slate-500">تشغيل أو إيقاف صوت التنبيه للرسائل والبلاغات الجديدة.</p>
            </div>
            <button
              type="button"
              onClick={() => setAlertsEnabled((prev) => !prev)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${alertsEnabled ? "bg-emerald-600 text-white" : "border border-slate-300 bg-white text-slate-700"}`}
            >
              {alertsEnabled ? "مفعّل" : "متوقف"}
            </button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>الملف الشخصي</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loadingProfile ? <p className="text-sm text-slate-500">جاري تحميل البيانات...</p> : null}
          <div>
            <p className="mb-2 text-sm font-medium">الاسم الكامل</p>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="الاسم الكامل" />
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">رقم الجوال</p>
            <Input value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="05XXXXXXXX" />
          </div>
          <button
            type="button"
            onClick={() => void saveProfile()}
            disabled={savingProfile || loadingProfile}
            className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {savingProfile ? "جاري الحفظ..." : "حفظ التغييرات"}
          </button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>الفوترة</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {billingLoading ? (
            <p className="text-sm text-slate-500">جاري تحميل بيانات الفوترة...</p>
          ) : !billing ? (
            <p className="text-sm text-slate-500">لا تتوفر بيانات فوترة للشركة النشطة حالياً.</p>
          ) : (
            <>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-sm font-semibold text-slate-900">الباقة الحالية: {billing.plan_name}</p>
                <p className="text-xs text-slate-600">Plan Key: {billing.plan_key} - السعر الشهري: {billing.price_monthly} SAR</p>
              </div>
              <div className="grid gap-2 md:grid-cols-3">
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                  الفنيون: {billing.usage.technicians}/{billing.limits.technicians ?? "غير محدود"}
                </div>
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                  التذاكر هذا الشهر: {billing.usage.tickets_this_month}/{billing.limits.tickets_per_month ?? "غير محدود"}
                </div>
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                  المناطق: {billing.usage.zones}/{billing.limits.zones ?? "غير محدود"}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="mb-2 text-sm font-semibold text-slate-900">آخر الفواتير</p>
                {invoices.length === 0 ? (
                  <p className="text-xs text-slate-500">لا توجد فواتير بعد.</p>
                ) : (
                  <div className="space-y-2 text-xs text-slate-700">
                    {invoices.slice(0, 3).map((inv) => (
                      <div key={inv.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-100 p-2">
                        <p>
                          {(inv.invoice_number ?? inv.id.slice(0, 8)).toUpperCase()} | {inv.period_start} → {inv.period_end} | {inv.amount} {inv.currency} | {inv.invoice_status}
                        </p>
                        {inv.invoice_status !== "paid" ? (
                          <Button
                            type="button"
                            className="h-7 bg-emerald-600 px-2 text-xs hover:bg-emerald-700"
                            disabled={payingInvoiceId === inv.id}
                            onClick={() => void startInvoicePayment(inv.id)}
                          >
                            {payingInvoiceId === inv.id ? "جاري التحويل..." : "دفع الآن"}
                          </Button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="mb-2 text-sm font-semibold text-slate-900">ترقية الباقة</p>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    className="h-9 min-w-[220px] rounded-md border border-slate-200 bg-white px-2 text-xs"
                    value={selectedPlan}
                    onChange={(e) => setSelectedPlan(e.target.value)}
                  >
                    {plans.map((plan) => (
                      <option key={plan.plan_key} value={plan.plan_key}>
                        {plan.display_name} - {plan.price_monthly} SAR
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    className="h-9 bg-indigo-600 px-3 text-xs hover:bg-indigo-700"
                    disabled={upgradingPlan || !selectedPlan}
                    onClick={() => void createUpgradeAndPay()}
                  >
                    {upgradingPlan ? "جاري الإنشاء..." : "إنشاء فاتورة الترقية والدفع"}
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {profileRole === "admin" ? (
        <Card>
          <CardHeader>
            <CardTitle>تنبيهات الفوترة والاشتراك</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {notifications.length === 0 ? (
              <p className="text-xs text-slate-500">لا توجد تنبيهات حالياً.</p>
            ) : (
              notifications.slice(0, 5).map((n) => (
                <div key={n.id} className="rounded border border-slate-200 bg-slate-50 p-2">
                  <p className="text-sm font-semibold text-slate-900">{n.title}</p>
                  <p className="text-xs text-slate-700">{n.body}</p>
                  <p className="mt-1 text-[10px] text-slate-500">{new Date(n.created_at).toLocaleString("ar-SA")}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>المظهر</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <div>
              <p className="text-sm font-medium">وضع الواجهة</p>
              <p className="text-xs text-slate-500">اختر بين الوضع الفاتح والوضع الليلي.</p>
            </div>
            <button
              type="button"
              onClick={() => setIsDarkMode((prev) => !prev)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${isDarkMode ? "bg-slate-900 text-white" : "border border-slate-300 bg-white text-slate-700"}`}
            >
              {isDarkMode ? "الوضع الليلي" : "الوضع الفاتح"}
            </button>
          </div>
        </CardContent>
      </Card>

      {profileRole === "admin" ? (
        <Card className="border-amber-200 bg-amber-50/40">
          <CardHeader>
            <CardTitle className="text-amber-950">أدوات المدير</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-amber-900/90">
              اختبار وصول إشعار النظام بعد إغلاق التبويب أو التطبيق (يعتمد على المتصفح ونظام التشغيل).
            </p>
            <Button
              type="button"
              variant="outline"
              className="border-amber-400 bg-white text-amber-950 hover:bg-amber-100"
              disabled={testNotifyPending || loadingProfile}
              onClick={() => scheduleDelayedTestNotification()}
            >
              {testNotifyPending ? "تم جدولة الاختبار..." : "اختبار التنبيه اللحظي"}
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
