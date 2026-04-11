"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, LayoutDashboard, ListTodo, MapPinned, Menu, Settings, Ticket, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { LogoutButton } from "@/components/logout-button";
import type { AppPermissionKey } from "@/lib/permissions";

type DashboardSidebarProps = {
  fullName: string;
  role: string;
  permissions: Record<AppPermissionKey, boolean>;
};

type NavItem = {
  href: string;
  label: string;
  icon: typeof MapPinned;
  perm: AppPermissionKey;
  /** إن وُجدت، يُعرض الرابط فقط لهذه الأدوار */
  roles?: string[];
};

const NAV_DEF: NavItem[] = [
  { href: "/dashboard/map", label: "الخريطة", icon: MapPinned, perm: "view_map" },
  { href: "/dashboard", label: "لوحة التحكم", icon: LayoutDashboard, perm: "view_dashboard" },
  { href: "/dashboard/tickets", label: "البلاغات", icon: Ticket, perm: "view_tickets" },
  { href: "/dashboard/tasks", label: "المهام", icon: ListTodo, perm: "view_tickets", roles: ["reporter"] },
  { href: "/dashboard/reports", label: "التقارير", icon: BarChart3, perm: "view_reports" },
  { href: "/dashboard/admin/zones", label: "إدارة المناطق", icon: MapPinned, perm: "manage_zones" },
  { href: "/dashboard/admin/users", label: "إدارة المستخدمين", icon: Users, perm: "manage_users" },
  { href: "/dashboard/settings", label: "الإعدادات", icon: Settings, perm: "view_settings" },
];

export function DashboardSidebar({ fullName, role, permissions }: DashboardSidebarProps) {
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

  const navItems = NAV_DEF.filter(
    (item) => permissions[item.perm] && (!item.roles || item.roles.includes(role)),
  );

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
                ? "border-s border-green-700 bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-50"
                : "text-slate-900 hover:bg-white dark:text-slate-100 dark:hover:bg-slate-900",
            )}
          >
            <Icon className={cn("h-5 w-5", active ? "text-green-700 dark:text-green-500" : "text-slate-700 dark:text-slate-300")} />
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
        className="fixed right-3 top-3 z-50 rounded-lg border border-slate-200 bg-white p-2.5 md:hidden dark:border-slate-800 dark:bg-slate-900"
        onClick={() => setMobileOpen(true)}
      >
        <Menu className="h-5 w-5 text-slate-700 dark:text-slate-100" />
      </button>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 md:hidden" dir="rtl" lang="ar">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="إغلاق القائمة"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute right-0 top-0 flex h-full w-72 max-w-[86vw] flex-col border-l border-slate-200 bg-slate-100 p-4 pb-32 dark:border-slate-800 dark:bg-slate-950">
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                aria-label="إغلاق"
                className="rounded-md border border-slate-200 p-2 dark:border-slate-700"
                onClick={() => setMobileOpen(false)}
              >
                <X className="h-4 w-4 dark:text-slate-100" />
              </button>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">القائمة</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
              <p className="text-xs font-medium text-slate-700 dark:text-slate-200">تسجيل الدخول باسم</p>
              <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                {roleLabel}: {fullName}
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto pb-4">{navList}</div>
            <div className="absolute bottom-4 left-4 right-4">
              <LogoutButton />
            </div>
          </aside>
        </div>
      ) : null}

      <aside className="hidden h-screen w-72 flex-col border-r border-slate-200 bg-slate-100 p-4 dark:border-slate-800 dark:bg-slate-950 md:flex" dir="rtl" lang="ar">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-700 dark:text-slate-200">تسجيل الدخول باسم</p>
          <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
            {roleLabel}: {fullName}
          </p>
        </div>
        {navList}

        <div className="mt-auto pt-4">
          <LogoutButton />
        </div>
      </aside>
    </>
  );
}
