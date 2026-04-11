"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
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

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetSending, setResetSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetMessage, setResetMessage] = useState<string | null>(null);

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

  const translateAuthError = (msg: string) => {
    const m = msg.trim();
    if (m === "Invalid login credentials") {
      return "بيانات الدخول غير صحيحة. إذا كان حسابك باسم مستخدم داخلي، جرّب إدخال الاسم فقط (بدون بريد) أو الصيغة name@makkah.sys";
    }
    return msg;
  };

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
        setError(translateAuthError(signInError.message));
        setLoading(false);
        return;
      }

      if (!data?.user) {
        await logAuthError("Login failed (no user returned)", data);
        setError("فشل تسجيل الدخول. حاول مرة أخرى.");
        setLoading(false);
        return;
      }

      const userId = data.user.id;
      const fallbackName = data.user.email ?? authEmail;

      const { data: profileRow, error: profileReadError } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", userId)
        .maybeSingle();

      if (profileReadError) {
        await logAuthError("Profile check failed after login", profileReadError);
        setError("تم الدخول لكن تعذر التحقق من الملف الشخصي. راجع السجلات.");
        setLoading(false);
        return;
      }

      if (!profileRow) {
        const { error: createProfileError } = await supabase.from("profiles").insert({
          id: userId,
          full_name: fallbackName,
          mobile: "N/A",
          role: "reporter",
        });

        if (createProfileError) {
          await logAuthError("Profile creation failed after login", createProfileError);
          setError("تم الدخول لكن فشل إنشاء الملف الشخصي. راجع السجلات.");
          setLoading(false);
          return;
        }

        await logInfo("Profile created/found", { status: "created", userId });
      } else {
        await logInfo("Profile created/found", { status: "found", userId });
      }

      router.replace("/");
      router.refresh();
    } catch (unexpectedError) {
      await logAuthError("Login unexpected error", unexpectedError);
      setError("حدث خطأ غير متوقع أثناء تسجيل الدخول.");
      setLoading(false);
    }
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
      setError(resetError.message);
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
    </main>
  );
}