"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { LayoutDashboard, ListTodo, LogOut, MapPinned, Settings, Ticket } from "lucide-react";
import { cn } from "@/lib/utils";
import { signOutCurrentSessionOnly } from "@/lib/auth-sign-out";
import type { AppPermissionKey } from "@/lib/permissions";

type DashboardBottomNavProps = {
  role: string;
  permissions: Record<AppPermissionKey, boolean>;
};

const MOBILE_NAV: Array<{
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  perm: AppPermissionKey;
  roles?: string[];
}> = [
  { href: "/dashboard", label: "الرئيسية", icon: LayoutDashboard, perm: "view_dashboard" },
  { href: "/dashboard/tickets", label: "الطلبات", icon: Ticket, perm: "view_tickets" },
  { href: "/dashboard/tasks", label: "المهام", icon: ListTodo, perm: "view_tickets", roles: ["reporter", "admin"] },
  { href: "/dashboard/map", label: "الخريطة", icon: MapPinned, perm: "view_map" },
  { href: "/dashboard/settings", label: "الإعدادات", icon: Settings, perm: "view_settings" },
];

export function DashboardBottomNav({ role, permissions }: DashboardBottomNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const filtered = MOBILE_NAV.filter(
    (item) => permissions[item.perm] && (!item.roles || item.roles.includes(role)),
  );

  const onLogout = async () => {
    setLoggingOut(true);
    await signOutCurrentSessionOnly();
    router.replace("/login");
    router.refresh();
  };

  const cols = filtered.length + 1;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-[8020] border-t border-slate-200 bg-white/95 shadow-[0_-4px_20px_rgba(15,23,42,0.08)] backdrop-blur md:hidden"
      dir="rtl"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div
        className="mx-auto grid max-w-xl"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {filtered.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={item.href === "/dashboard/map" ? false : true}
              onMouseEnter={() => router.prefetch(item.href)}
              onFocus={() => router.prefetch(item.href)}
              className={cn(
                "flex min-h-16 flex-col items-center justify-center gap-1 px-0.5 text-[11px] font-semibold leading-tight sm:text-xs",
                active ? "text-emerald-800 dark:text-emerald-400" : "text-slate-800 dark:text-slate-200",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="line-clamp-2 text-center">{item.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => void onLogout()}
          disabled={loggingOut}
          className="flex min-h-16 flex-col items-center justify-center gap-1 border-s border-slate-200 px-0.5 text-[11px] font-semibold leading-tight text-red-700 disabled:opacity-60 dark:border-slate-700 dark:text-red-400 sm:text-xs"
          aria-label="تسجيل الخروج"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          <span>{loggingOut ? "…" : "خروج"}</span>
        </button>
      </div>
    </nav>
  );
}
