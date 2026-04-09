"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, MapPinned, Settings, Ticket, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { LogoutButton } from "@/components/logout-button";

type DashboardSidebarProps = {
  fullName: string;
  role: string;
};

type NavItem = { href: string; label: string; icon: typeof MapPinned };

export function DashboardSidebar({ fullName, role }: DashboardSidebarProps) {
  const pathname = usePathname();
  const roleLabel =
    role === "admin"
      ? "مدير النظام"
      : role === "engineer"
        ? "مهندس"
        : role === "reporter"
          ? "مدخل بيانات"
        : role === "supervisor"
          ? "مشرف"
          : role === "technician"
            ? "فني"
            : role;
  const navItems: NavItem[] = (() => {
    const common: NavItem[] = [
      { href: "/dashboard/tickets", label: "البلاغات", icon: Ticket },
      { href: "/dashboard/settings", label: "الإعدادات", icon: Settings },
    ];
    if (role === "admin") {
      return [
        { href: "/dashboard/map", label: "الخريطة", icon: MapPinned },
        ...common,
        { href: "/dashboard/reports", label: "التقارير", icon: BarChart3 },
        { href: "/dashboard/admin/zones", label: "إدارة المناطق", icon: MapPinned },
        { href: "/dashboard/admin/users", label: "إدارة المستخدمين", icon: Users },
      ];
    }
    if (role === "reporter") {
      return common;
    }
    return [{ href: "/dashboard/map", label: "الخريطة", icon: MapPinned }, ...common];
  })();

  return (
    <aside className="flex h-screen w-72 flex-col border-r border-slate-200 bg-white p-4" dir="rtl" lang="ar">
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="text-xs text-slate-500">تسجيل الدخول باسم</p>
        <p className="mt-1 text-sm font-semibold text-slate-900">{roleLabel}: {fullName}</p>
      </div>

      <nav className="mt-6 space-y-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition",
                active ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100",
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto pt-4">
        <LogoutButton />
      </div>
    </aside>
  );
}