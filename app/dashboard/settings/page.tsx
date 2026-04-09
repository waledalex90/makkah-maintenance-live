"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const ALERT_SOUND_STORAGE_KEY = "ops_alert_sounds_enabled";
const THEME_MODE_STORAGE_KEY = "ops_theme_mode";

export default function DashboardSettingsPage() {
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [fullName, setFullName] = useState("");
  const [mobile, setMobile] = useState("");
  const [alertsEnabled, setAlertsEnabled] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    const savedAlerts = window.localStorage.getItem(ALERT_SOUND_STORAGE_KEY);
    setAlertsEnabled(savedAlerts !== "false");

    const savedTheme = window.localStorage.getItem(THEME_MODE_STORAGE_KEY);
    const dark = savedTheme === "dark";
    setIsDarkMode(dark);
    document.documentElement.classList.toggle("dark", dark);
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

      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, mobile")
        .eq("id", user.id)
        .single();

      if (error) {
        toast.error(error.message);
        setLoadingProfile(false);
        return;
      }

      setFullName(data?.full_name ?? "");
      setMobile(data?.mobile ?? "");
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
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: nextFullName, mobile: nextMobile })
      .eq("id", user.id);
    setSavingProfile(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("تم تحديث الملف الشخصي بنجاح.");
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
          <CardTitle>المظهر</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <div>
              <p className="text-sm font-medium">وضع الواجهة</p>
              <p className="text-xs text-slate-500">اختر بين الوضع الفاتح والوضع الليلي.</p>
            </div>
            <button
              onClick={() => setIsDarkMode((prev) => !prev)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${isDarkMode ? "bg-slate-900 text-white" : "border border-slate-300 bg-white text-slate-700"}`}
            >
              {isDarkMode ? "الوضع الليلي" : "الوضع الفاتح"}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}