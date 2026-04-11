"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { signOutCurrentSessionOnly } from "@/lib/auth-sign-out";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
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
      className="h-11 w-full justify-start bg-red-600 text-white hover:bg-red-700"
      disabled={loading}
      onClick={onLogout}
    >
      <LogOut className="ml-2 h-4 w-4" />
      {loading ? "جاري تسجيل الخروج..." : "تسجيل الخروج"}
    </Button>
  );
}