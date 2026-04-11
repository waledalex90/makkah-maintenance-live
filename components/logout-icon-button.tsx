"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { signOutCurrentSessionOnly } from "@/lib/auth-sign-out";
import { Button } from "@/components/ui/button";

export function LogoutIconButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const onLogout = async () => {
    setLoading(true);
    await signOutCurrentSessionOnly();
    router.replace("/login");
    router.refresh();
  };

  return (
    <Button
      type="button"
      variant="outline"
      className="h-10 min-w-10 border-red-400 bg-white text-red-800 hover:bg-red-50 dark:border-red-700 dark:bg-slate-900 dark:text-red-300 dark:hover:bg-slate-800"
      onClick={onLogout}
      disabled={loading}
      aria-label="تسجيل الخروج"
      title="تسجيل الخروج"
    >
      <LogOut className="h-4 w-4" />
    </Button>
  );
}
