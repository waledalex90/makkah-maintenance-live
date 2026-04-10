"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, LayoutDashboard, MapPinned, Menu, Settings, Ticket, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { LogoutButton } from "@/components/logout-button";

type DashboardSidebarProps = {
  fullName: string;
  role: string;
};

type NavItem = { href: string; label: string; icon: typeof MapPinned };

export function DashboardSidebar({ fullName, role }: DashboardSidebarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const roleLabel =
    role === "admin"
      ? "مدير النظام"
      : role === "projects_director"
        ? "مدير المشاريع"
      : role === "project_manager"
        ? "مدير مشروع"
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
      { href: "/dashboard", label: "لوحة التحكم", icon: LayoutDashboard },
      { href: "/dashboard/tickets", label: "البلاغات", icon: Ticket },
      { href: "/dashboard/settings", label: "الإعدادات", icon: Settings },
    ];
    if (role === "admin" || role === "project_manager" || role === "projects_director") {
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

  const navList = (
    <nav className="mt-6 space-y-2">
      {navItems.map((item) => {
        const Icon = item.icon;
        const active = pathname === item.href;

        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch={item.href === "/dashboard/map" ? false : undefined}
            onClick={() => setMobileOpen(false)}
            className={cn(
              "flex min-h-12 items-center gap-2 rounded-md px-3 py-3 text-sm font-medium transition",
              active
                ? "border-s border-green-600 bg-white text-slate-900 shadow-sm"
                : "text-slate-700 hover:bg-white",
            )}
          >
            <Icon className={cn("h-5 w-5", active ? "text-green-600" : "text-slate-600")} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
      <button
        type="button"
        aria-label="فتح القائمة"
        className="fixed right-3 top-3 z-50 rounded-lg border border-slate-200 bg-white p-2.5 shadow md:hidden"
        onClick={() => setMobileOpen(true)}
      >
        <Menu className="h-5 w-5 text-slate-700" />
      </button>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 md:hidden" dir="rtl" lang="ar">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="إغلاق القائمة"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute right-0 top-0 flex h-full w-72 max-w-[86vw] flex-col border-l border-slate-200 bg-slate-100 p-4 pb-20 shadow-2xl">
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                aria-label="إغلاق"
                className="rounded-md border border-slate-200 p-2"
                onClick={() => setMobileOpen(false)}
              >
                <X className="h-4 w-4" />
              </button>
              <p className="text-sm font-semibold text-slate-900">القائمة</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">تسجيل الدخول باسم</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{roleLabel}: {fullName}</p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto pb-4">{navList}</div>
            <div className="absolute bottom-4 left-4 right-4">
              <LogoutButton />
            </div>
          </aside>
        </div>
      ) : null}

      <aside className="hidden h-screen w-72 flex-col border-r border-slate-200 bg-slate-100 p-4 md:flex" dir="rtl" lang="ar">
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="text-xs text-slate-500">تسجيل الدخول باسم</p>
        <p className="mt-1 text-sm font-semibold text-slate-900">{roleLabel}: {fullName}</p>
      </div>
      {navList}

      <div className="mt-auto pt-4">
        <LogoutButton />
      </div>
      </aside>
    </>
  );
}