"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
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

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        await logAuthError("Login failed (Supabase signInWithPassword)", signInError);
        setError(signInError.message);
        setLoading(false);
        return;
      }

      if (!data?.user) {
        await logAuthError("Login failed (no user returned)", data);
        setError("Login failed. Please try again.");
        setLoading(false);
        return;
      }

      const userId = data.user.id;
      const fallbackName = data.user.email ?? email;

      const { data: profileRow, error: profileReadError } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", userId)
        .maybeSingle();

      if (profileReadError) {
        await logAuthError("Profile check failed after login", profileReadError);
        setError("Logged in, but failed to verify profile. Check logs.");
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
          setError("Login succeeded but profile creation failed. Check logs.");
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
      setError("Unexpected login error. Check console for details.");
      setLoading(false);
    }
  };

  const onForgotPassword = async () => {
    if (!email.trim()) {
      setError("أدخل البريد الإلكتروني أولاً لإرسال رابط إعادة التعيين.");
      return;
    }
    setResetSending(true);
    setError(null);
    setResetMessage(null);
    const redirectTo = `${window.location.origin}/update-password`;
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
    setResetSending(false);
    if (resetError) {
      setError(resetError.message);
      return;
    }
    setResetMessage("تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني.");
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
          <CardDescription>Sign in with your work account.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
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
              {loading ? "Signing in..." : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
      <p className="absolute bottom-3 text-[10px] font-medium text-slate-600 dark:text-slate-400">v1.0.5 - Azzam Live</p>
    </main>
  );
}