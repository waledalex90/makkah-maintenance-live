"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
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
      variant="outline"
      className="w-full justify-start"
      disabled={loading}
      onClick={onLogout}
    >
      <LogOut className="ml-2 h-4 w-4" />
      {loading ? "جاري تسجيل الخروج..." : "تسجيل الخروج"}
    </Button>
  );
}