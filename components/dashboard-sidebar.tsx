"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, LayoutDashboard, ListTodo, MapPinned, Settings, Ticket, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { LogoutButton } from "@/components/logout-button";
import { LogoutIconButton } from "@/components/logout-icon-button";
import type { AppPermissionKey } from "@/lib/permissions";

type DashboardSidebarProps = {
  fullName: string;
  role: string;
  permissions: Record<AppPermissionKey, boolean>;
  collapsed: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
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
  { href: "/dashboard/tasks", label: "المهام", icon: ListTodo, perm: "view_tickets", roles: ["reporter", "admin"] },
  { href: "/dashboard/reports", label: "التقارير", icon: BarChart3, perm: "view_reports" },
  { href: "/dashboard/admin/zones", label: "إدارة المناطق", icon: MapPinned, perm: "manage_zones" },
  { href: "/dashboard/admin/users", label: "إدارة المستخدمين", icon: Users, perm: "manage_users" },
  { href: "/dashboard/settings", label: "الإعدادات", icon: Settings, perm: "view_settings" },
];

export function DashboardSidebar({
  fullName,
  role,
  permissions,
  collapsed,
  mobileOpen,
  onCloseMobile,
}: DashboardSidebarProps) {
  const pathname = usePathname();
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

  const navList = (isCollapsed: boolean, onNavigate?: () => void) => (
    <nav className={cn("mt-6 space-y-2", isCollapsed ? "mt-4" : "mt-6")}>
      {navItems.map((item) => {
        const Icon = item.icon;
        const active = pathname === item.href;

        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch={item.href === "/dashboard/map" ? false : undefined}
            onClick={onNavigate}
            title={item.label}
            className={cn(
              "flex min-h-12 items-center rounded-md px-3 py-3 text-sm font-medium transition duration-300",
              isCollapsed ? "justify-center px-2" : "gap-2",
              active
                ? "border-s border-[#d4af37] bg-white text-[#064e3b] dark:bg-slate-900 dark:text-emerald-200"
                : "text-slate-900 hover:bg-white dark:text-slate-100 dark:hover:bg-slate-900",
            )}
          >
            <Icon className={cn("h-5 w-5 shrink-0", active ? "text-[#064e3b] dark:text-[#d4af37]" : "text-slate-700 dark:text-slate-300")} />
            {!isCollapsed ? <span>{item.label}</span> : null}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-[8040] md:hidden transition-opacity duration-300",
          mobileOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
        )}
        dir="rtl"
        lang="ar"
      >
        <button
          type="button"
          className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
          aria-label="إغلاق القائمة"
          onClick={onCloseMobile}
        />
        <aside
          className={cn(
            "absolute right-0 top-0 z-[1] flex h-full w-72 max-w-[86vw] flex-col border-l border-emerald-900/20 bg-[#f8f7f2] p-4 pb-28 shadow-2xl transition-transform duration-300 will-change-transform dark:border-emerald-800/40 dark:bg-slate-950",
            mobileOpen ? "translate-x-0" : "translate-x-full",
          )}
        >
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              aria-label="إغلاق"
              className="rounded-md border border-slate-200 p-2 dark:border-slate-700"
              onClick={onCloseMobile}
            >
              <X className="h-4 w-4 dark:text-slate-100" />
            </button>
            <p className="text-sm font-semibold text-[#064e3b] dark:text-emerald-200">القائمة</p>
          </div>
          <div className="rounded-lg border border-[#d4af37]/35 bg-white p-3 dark:border-amber-700/30 dark:bg-slate-900">
            <p className="text-xs font-medium text-slate-700 dark:text-slate-200">تسجيل الدخول باسم</p>
            <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
              {roleLabel}: {fullName}
            </p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto pb-4">{navList(false, onCloseMobile)}</div>
          <div className="absolute bottom-4 left-4 right-4">
            <LogoutButton />
          </div>
        </aside>
      </div>

      <aside
        className={cn(
          "hidden h-dvh shrink-0 flex-col border-r border-emerald-900/20 bg-[#f8f7f2] p-4 transition-[width] duration-300 will-change-[width] dark:border-emerald-900/40 dark:bg-slate-950 md:flex",
          collapsed ? "w-20" : "w-72",
        )}
        dir="rtl"
        lang="ar"
      >
        <div className={cn("rounded-lg border border-[#d4af37]/35 bg-white p-3 dark:border-amber-700/30 dark:bg-slate-900", collapsed && "p-2 text-center")}>
          <p className="text-xs font-medium text-slate-700 dark:text-slate-200">{collapsed ? "المستخدم" : "تسجيل الدخول باسم"}</p>
          {!collapsed ? (
            <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
              {roleLabel}: {fullName}
            </p>
          ) : null}
        </div>
        {navList(collapsed)}

        <div className="mt-auto flex justify-center pt-4">
          {collapsed ? <LogoutIconButton /> : <LogoutButton />}
        </div>
      </aside>
    </>
  );
}
