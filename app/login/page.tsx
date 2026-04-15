"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { mapAuthErrorToArabic } from "@/lib/auth-error-messages-ar";
import { signOutCurrentSessionOnly } from "@/lib/auth-sign-out";
import { postLoginHrefForProfile } from "@/lib/post-login-redirect";
import { isProtectedSuperAdminEmail } from "@/lib/protected-super-admin";
import {
  AUTH_EMAIL_DOMAIN,
  parseUsernameOrEmailLocalPart,
  resolveSignInEmail,
  toAuthEmail,
} from "@/lib/username-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type LoginMembershipRow = {
  company_id: string;
  companies?: { name?: string | null } | { name?: string | null }[] | null;
};

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetSending, setResetSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("");
  const [selectingCompany, setSelectingCompany] = useState(false);
  const [pendingLogin, setPendingLogin] = useState<{
    userId: string;
    role: string | null;
    access_work_list: boolean | null;
    memberships: Array<{ company_id: string; company_name: string }>;
  } | null>(null);

  const logAuthError = async (context: string, details: unknown) => {
    console.error(context, details);
    try {
      await fetch("/api/log-client-error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context, details }),
      });
    } catch (logError) {
      console.error("Failed to forward auth error to server log", logError);
    }
  };

  const logInfo = async (message: string, details?: unknown) => {
    console.log(message, details);
    try {
      await fetch("/api/log-client-info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, details }),
      });
    } catch (logError) {
      console.error("Failed to forward client info log to server", logError);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("notice") === "missing_profile") {
      setError("لا يوجد ملف شخصي مرتبط بحسابك. اتصل بالإدارة لإكمال التسجيل.");
      window.history.replaceState({}, "", "/login");
    }
  }, []);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      let authEmail: string;
      try {
        authEmail = resolveSignInEmail(username);
      } catch (e) {
        setError(e instanceof Error ? e.message : "اسم المستخدم غير صالح.");
        setLoading(false);
        return;
      }

      let { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: authEmail,
        password,
      });

      /** إن فشل الدخول ببريد حقيقي (مثل Gmail) جرّب الحساب الاصطناعي user@makkah.sys لأن كثيرًا من الحسابات تُخزَّن هكذا */
      const raw = username.trim();
      const looksInvalidCreds =
        signInError &&
        (signInError.message?.toLowerCase().includes("invalid login") ||
          signInError.message?.toLowerCase().includes("invalid credential"));
      if (looksInvalidCreds && raw.includes("@") && !raw.toLowerCase().endsWith(`@${AUTH_EMAIL_DOMAIN}`)) {
        const local = parseUsernameOrEmailLocalPart(raw);
        if (local) {
          try {
            const synthetic = toAuthEmail(local);
            if (synthetic.toLowerCase() !== authEmail.toLowerCase()) {
              const second = await supabase.auth.signInWithPassword({
                email: synthetic,
                password,
              });
              data = second.data;
              signInError = second.error;
            }
          } catch {
            /* ignore */
          }
        }
      }

      if (signInError) {
        await logAuthError("Login failed (Supabase signInWithPassword)", signInError);
        setError(mapAuthErrorToArabic(signInError));
        setLoading(false);
        return;
      }

      if (!data?.user) {
        await logAuthError("Login failed (no user returned)", data);
        setError("فشل تسجيل الدخول دون إرجاع مستخدم. حاول مرة أخرى.");
        setLoading(false);
        return;
      }

      const userId = data.user.id;

      const { data: profileRow, error: profileReadError } = await supabase
        .from("profiles")
        .select("role, access_work_list")
        .eq("id", userId)
        .maybeSingle();

      if (profileReadError) {
        await logAuthError("Profile check failed after login", profileReadError);
        setError("تعذر التحقق من الملف الشخصي. راجع الإدارة أو حاول لاحقاً.");
        await signOutCurrentSessionOnly();
        setLoading(false);
        return;
      }

      if (!profileRow) {
        await logAuthError("Login blocked: no profile row", { userId });
        await signOutCurrentSessionOnly();
        setError(
          "لا يوجد ملف شخصي مرتبط بهذا الحساب. يجب أن يُنشئ المسؤول حسابك من «إدارة المستخدمين» أولاً.",
        );
        setLoading(false);
        return;
      }

      await logInfo("Login profile ok", { userId, role: profileRow.role });

      if (isProtectedSuperAdminEmail(data.user.email)) {
        await supabase.from("profiles").update({ active_company_id: null }).eq("id", userId);
        setLoading(false);
        router.replace("/dashboard/admin/platform");
        router.refresh();
        return;
      }

      const { data: membershipsData, error: membershipsError } = await supabase
        .from("company_memberships")
        .select("company_id, companies:company_id(name)")
        .eq("user_id", userId)
        .eq("status", "active");

      if (membershipsError) {
        await logAuthError("Membership check failed after login", membershipsError);
      }

      const memberships = ((membershipsData ?? []) as LoginMembershipRow[])
        .map((m) => ({
          company_id: String(m.company_id),
          company_name: (Array.isArray(m.companies) ? m.companies[0]?.name : m.companies?.name) ?? String(m.company_id),
        }))
        .filter((m) => Boolean(m.company_id));

      if (memberships.length > 1) {
        setSelectedCompanyId(memberships[0].company_id);
        setPendingLogin({
          userId,
          role: profileRow.role,
          access_work_list: profileRow.access_work_list,
          memberships,
        });
        setLoading(false);
        return;
      }

      if (memberships.length === 1) {
        await supabase.from("profiles").update({ active_company_id: memberships[0].company_id }).eq("id", userId);
      }

      setLoading(false);
      const nextHref = postLoginHrefForProfile({
        role: profileRow.role,
        access_work_list: profileRow.access_work_list,
      });
      router.replace(nextHref);
      router.refresh();
    } catch (unexpectedError) {
      await logAuthError("Login unexpected error", unexpectedError);
      setError("حدث خطأ غير متوقع أثناء تسجيل الدخول.");
      setLoading(false);
    }
  };

  const continueWithSelectedCompany = async () => {
    if (!pendingLogin || !selectedCompanyId) {
      setError("اختر الشركة أولاً.");
      return;
    }
    setSelectingCompany(true);
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ active_company_id: selectedCompanyId })
      .eq("id", pendingLogin.userId);
    setSelectingCompany(false);

    if (updateError) {
      await logAuthError("Failed setting active company at login", updateError);
      setError("تعذر اختيار الشركة النشطة.");
      return;
    }

    const nextHref = postLoginHrefForProfile({
      role: pendingLogin.role,
      access_work_list: pendingLogin.access_work_list,
    });
    setPendingLogin(null);
    router.replace(nextHref);
    router.refresh();
  };

  const onForgotPassword = async () => {
    if (!username.trim()) {
      setError("أدخل اسم المستخدم أولاً لإرسال رابط إعادة تعيين كلمة المرور.");
      return;
    }
    let authEmail: string;
    try {
      authEmail = resolveSignInEmail(username);
    } catch (e) {
      setError(e instanceof Error ? e.message : "اسم المستخدم غير صالح.");
      return;
    }
    setResetSending(true);
    setError(null);
    setResetMessage(null);
    const redirectTo = `${window.location.origin}/update-password`;
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(authEmail, { redirectTo });
    setResetSending(false);
    if (resetError) {
      setError(mapAuthErrorToArabic(resetError));
      return;
    }
    setResetMessage("إن وُجد الحساب، سيصلك بريد لإعادة تعيين كلمة المرور (تحقق من صندوق الوارد أو الرسائل غير المرغوبة).");
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mb-3 flex justify-center">
            <Image
              src="/icons/logo.webp"
              alt="شعار الشركة"
              width={220}
              height={88}
              priority
              className="h-20 w-auto object-contain"
            />
          </div>
          <CardTitle>بوابة عمليات عزام الشريف</CardTitle>
          <CardDescription>سجّل الدخول باسم المستخدم وكلمة المرور المعتمدة لدى الإدارة.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="username">اسم المستخدم أو البريد</Label>
              <Input
                id="username"
                dir="ltr"
                className="text-left"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="مثال: walid_admin أو بريدك الكامل"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">كلمة المرور</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            {resetMessage ? <p className="text-sm text-green-700">{resetMessage}</p> : null}

            <button
              type="button"
              className="text-sm font-semibold text-green-800 underline-offset-2 hover:underline disabled:opacity-60 dark:text-green-400"
              onClick={() => void onForgotPassword()}
              disabled={resetSending}
            >
              {resetSending ? "جاري إرسال الرابط..." : "نسيت كلمة المرور؟"}
            </button>

            <Button type="submit" className="w-full bg-green-700 text-white hover:bg-green-800 dark:bg-green-600 dark:hover:bg-green-500" disabled={loading}>
              {loading ? "جاري تسجيل الدخول..." : "دخول"}
            </Button>
          </form>
        </CardContent>
      </Card>
      <p className="absolute bottom-3 text-[10px] font-medium text-slate-600 dark:text-slate-400">v1.0.5 - Azzam Live</p>
      {pendingLogin ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>اختيار الشركة النشطة</CardTitle>
              <CardDescription>لديك أكثر من شركة. اختر الشركة التي تريد العمل عليها الآن.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <select
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                value={selectedCompanyId}
                onChange={(e) => setSelectedCompanyId(e.target.value)}
              >
                {pendingLogin.memberships.map((membership) => (
                  <option key={membership.company_id} value={membership.company_id}>
                    {membership.company_name}
                  </option>
                ))}
              </select>
              <Button className="w-full bg-green-700 hover:bg-green-800" disabled={selectingCompany} onClick={() => void continueWithSelectedCompany()}>
                {selectingCompany ? "جاري المتابعة..." : "متابعة"}
              </Button>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </main>
  );
}