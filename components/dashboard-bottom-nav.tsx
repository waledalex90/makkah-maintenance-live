"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, MapPinned, Settings, Ticket } from "lucide-react";
import { cn } from "@/lib/utils";

type DashboardBottomNavProps = {
  role: string;
};

export function DashboardBottomNav({ role }: DashboardBottomNavProps) {
  const pathname = usePathname();
  const nav = [
    { href: "/dashboard", label: "الرئيسية", icon: LayoutDashboard },
    { href: "/dashboard/tickets", label: "الطلبات", icon: Ticket },
    { href: "/dashboard/map", label: "الخريطة", icon: MapPinned },
    { href: "/dashboard/settings", label: "الإعدادات", icon: Settings },
  ];

  const filtered = role === "reporter" ? nav.filter((item) => item.href !== "/dashboard/map") : nav;

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
                "flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-medium",
                active ? "text-emerald-700" : "text-slate-600",
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
