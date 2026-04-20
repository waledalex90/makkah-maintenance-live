"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Building2, LayoutDashboard, ListTodo, MapPinned, Settings, Shield, Ticket, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { UpFlowLogo } from "@/components/upflow-logo";
import { LogoutButton } from "@/components/logout-button";
import { LogoutIconButton } from "@/components/logout-icon-button";
import type { AppPermissionKey } from "@/lib/permissions";

type DashboardSidebarProps = {
  fullName: string;
  role: string;
  isPlatformAdmin?: boolean;
  /** وضع معاينة شركة من المنصة (god mode) — تُعرض كل روابط التشغيل للدعم */
  isGodMode?: boolean;
  platformMode?: boolean;
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
  platformAdminOnly?: boolean;
};

const OPERATIONAL_NAV_DEF: NavItem[] = [
  { href: "/dashboard/map", label: "الخريطة", icon: MapPinned, perm: "view_map" },
  { href: "/dashboard", label: "لوحة التحكم", icon: LayoutDashboard, perm: "view_dashboard" },
  { href: "/dashboard/tickets", label: "البلاغات", icon: Ticket, perm: "view_tickets" },
  { href: "/dashboard/tasks", label: "المهام", icon: ListTodo, perm: "view_tickets", roles: ["reporter", "admin"] },
  { href: "/dashboard/reports", label: "تقارير", icon: BarChart3, perm: "view_reports" },
  { href: "/dashboard/admin/zones", label: "إدارة المناطق", icon: MapPinned, perm: "manage_zones" },
  { href: "/dashboard/admin/users", label: "إدارة الفريق والصلاحيات", icon: Users, perm: "manage_users" },
  { href: "/dashboard/settings", label: "الإعدادات", icon: Settings, perm: "view_settings" },
];

const PLATFORM_NAV_DEF: NavItem[] = [
  { href: "/dashboard/admin/platform", label: "UP FLOW — لوحة المنصة", icon: Building2, perm: "manage_users", platformAdminOnly: true },
  { href: "/dashboard/admin/companies", label: "إدارة الشركات", icon: Users, perm: "manage_users", platformAdminOnly: true },
  { href: "/dashboard/admin/billing", label: "الفواتير", icon: BarChart3, perm: "manage_users", platformAdminOnly: true },
  { href: "/dashboard/admin/monitoring", label: "الأمان", icon: Shield, perm: "manage_users", platformAdminOnly: true },
];

export function DashboardSidebar({
  fullName,
  role,
  isPlatformAdmin = false,
  isGodMode = false,
  platformMode = false,
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

  const supportPreview = Boolean(isGodMode && isPlatformAdmin);

  const filterNav = (def: NavItem[]) =>
    def.filter((item) => {
      const permOk = item.platformAdminOnly
        ? Boolean(isPlatformAdmin)
        : Boolean(permissions[item.perm]) || supportPreview;
      const roleOk = !item.roles || item.roles.includes(role) || supportPreview;
      return permOk && roleOk;
    });

  const operationalItems = filterNav(OPERATIONAL_NAV_DEF);
  const platformItems = filterNav(PLATFORM_NAV_DEF);

  /** وضع المنصة فقط: روابط المنصة. وضع معاينة شركة + مدير منصة: تشغيل + منصة معاً */
  const navSections: { title: string | null; items: NavItem[] }[] = platformMode
    ? [{ title: null, items: platformItems }]
    : isPlatformAdmin
      ? [
          { title: null, items: operationalItems },
          { title: "إدارة المنصة", items: platformItems },
        ]
      : [{ title: null, items: operationalItems }];

  const navList = (isCollapsed: boolean, onNavigate?: () => void) => (
    <nav className={cn("mt-6 space-y-2", isCollapsed ? "mt-4" : "mt-6")}>
      {navSections.map((section) => (
        <div key={section.title ?? "main"} className="space-y-2">
          {section.title && !isCollapsed ? (
            <p className="px-3 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{section.title}</p>
          ) : null}
          {section.title && isCollapsed ? <div className="mx-auto my-2 h-px w-8 bg-slate-200" aria-hidden /> : null}
          {section.items.map((item) => {
            const Icon = item.icon;
            const hrefPath = item.href.split("?")[0];
            const active = pathname === hrefPath;

            return (
              <Link
                key={`${section.title ?? "main"}-${item.href}`}
                href={item.href}
                prefetch={item.href.includes("/dashboard/map") ? false : true}
                onClick={onNavigate}
                title={item.label}
                className={cn(
                  "flex min-h-12 items-center rounded-xl px-3 py-3 text-sm font-medium transition duration-300 ease-in-out",
                  isCollapsed ? "justify-center px-2" : "gap-2",
                  active
                    ? "border-s border-[color:var(--brand-accent)] bg-slate-100 text-slate-900"
                    : "text-slate-700 hover:bg-slate-100",
                )}
              >
                <Icon
                  className={cn(
                    "h-5 w-5 shrink-0 transition-colors duration-300 ease-in-out",
                    active ? "text-[color:var(--brand-accent)]" : "text-slate-600",
                  )}
                />
                {!isCollapsed ? <span>{item.label}</span> : null}
              </Link>
            );
          })}
        </div>
      ))}
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
            "absolute right-0 top-0 z-[1] flex h-full w-72 max-w-[86vw] flex-col border-l border-slate-200 bg-slate-50 p-4 pb-28 shadow-2xl transition-transform duration-300 ease-in-out will-change-transform",
            mobileOpen ? "translate-x-0" : "translate-x-full",
          )}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <UpFlowLogo className="h-7 w-7 shrink-0 text-[color:var(--brand-primary)]" />
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">UP FLOW</p>
                <p className="truncate text-sm font-bold text-slate-900">القائمة</p>
              </div>
            </div>
            <button
              type="button"
              aria-label="إغلاق"
              className="shrink-0 rounded-xl border border-slate-200 p-2"
              onClick={onCloseMobile}
            >
              <X className="h-4 w-4 text-slate-700" />
            </button>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-100 p-3">
            <p className="text-xs font-medium text-slate-700">المستخدم الحالي</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">
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
          "hidden h-dvh shrink-0 flex-col border-l border-slate-200 bg-slate-50 p-4 transition-[width] duration-300 ease-in-out will-change-[width] md:flex",
          collapsed ? "w-20" : "w-72",
        )}
        dir="rtl"
        lang="ar"
      >
        <div className={cn("mb-4 flex items-center gap-2", collapsed && "justify-center")}>
          <UpFlowLogo className={cn("shrink-0 text-[color:var(--brand-primary)]", collapsed ? "h-8 w-8" : "h-7 w-7")} />
          {!collapsed ? (
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">UP FLOW</p>
              <p className="truncate text-sm font-bold text-slate-900">منصة التشغيل</p>
            </div>
          ) : null}
        </div>
        <div className={cn("rounded-xl border border-slate-200 bg-slate-100 p-3", collapsed && "p-2 text-center")}>
          <p className="text-xs font-medium text-slate-700">{collapsed ? "المستخدم" : "المستخدم الحالي"}</p>
          {!collapsed ? (
            <p className="mt-1 text-sm font-semibold text-slate-900">
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
