"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";

export function LogoutIconButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const onLogout = async () => {
    setLoading(true);
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  };

  return (
    <Button
      type="button"
      variant="outline"
      className="h-10 min-w-10 border-red-300 bg-white text-red-600 hover:bg-red-50 dark:border-red-800 dark:bg-slate-800 dark:text-red-400 dark:hover:bg-slate-700"
      onClick={onLogout}
      disabled={loading}
      aria-label="تسجيل الخروج"
      title="تسجيل الخروج"
    >
      <LogOut className="h-4 w-4" />
    </Button>
  );
}
