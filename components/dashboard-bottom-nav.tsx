"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ListTodo, MapPinned, Settings, Ticket } from "lucide-react";
import { cn } from "@/lib/utils";
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
  { href: "/dashboard/tasks", label: "المهام", icon: ListTodo, perm: "view_tickets", roles: ["reporter"] },
  { href: "/dashboard/map", label: "الخريطة", icon: MapPinned, perm: "view_map" },
  { href: "/dashboard/settings", label: "الإعدادات", icon: Settings, perm: "view_settings" },
];

export function DashboardBottomNav({ role, permissions }: DashboardBottomNavProps) {
  const pathname = usePathname();
  const filtered = MOBILE_NAV.filter(
    (item) => permissions[item.perm] && (!item.roles || item.roles.includes(role)),
  );

  if (filtered.length === 0) {
    return null;
  }

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 backdrop-blur md:hidden"
      dir="rtl"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto grid max-w-xl" style={{ gridTemplateColumns: `repeat(${filtered.length}, minmax(0, 1fr))` }}>
        {filtered.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-semibold",
                active ? "text-emerald-800 dark:text-emerald-400" : "text-slate-800 dark:text-slate-200",
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
