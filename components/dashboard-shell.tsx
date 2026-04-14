"use client";

import { useEffect, useMemo, useState } from "react";
import { DashboardSidebar } from "@/components/dashboard-sidebar";
import { LiveLocationTracker } from "@/components/live-location-tracker";
import { DashboardBottomNav } from "@/components/dashboard-bottom-nav";
import { PageTransition } from "@/components/page-transition";
import { DashboardTopbar } from "@/components/dashboard-topbar";
import { effectivePermissions } from "@/lib/permissions";
import type { AppPermissionKey } from "@/lib/permissions";
import { toast } from "sonner";

type MeResponse =
  | {
      ok: true;
      profile: {
        id: string;
        full_name: string | null;
        role: string;
        role_id?: string | null;
        permissions: Record<string, unknown> | null;
        active_company_id?: string | null;
      };
      active_company?: {
        id: string;
        name: string;
        slug: string;
        company_logo_url?: string | null;
      } | null;
      active_membership?: {
        company_id: string;
        role_id?: string | null;
        role_key: string;
        role_display_name: string;
        effective_permissions: Record<AppPermissionKey, boolean>;
        company?: {
          id: string;
          name: string;
          slug: string;
          company_logo_url?: string | null;
        } | null;
      } | null;
      memberships?: Array<{
        company_id: string;
        role_key: string;
        role_display_name: string;
        company?: {
          id: string;
          name: string;
          slug: string;
          company_logo_url?: string | null;
        } | null;
      }>;
      is_platform_admin?: boolean;
    }
  | { ok: false; error: string };

const EMPTY_PERMISSIONS = {} as Record<AppPermissionKey, boolean>;

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [switchingCompany, setSwitchingCompany] = useState(false);

  const loadMe = async () => {
    try {
      const res = await fetch("/api/me", { cache: "no-store" });
      const json = (await res.json()) as MeResponse;
      setMe(json);
    } catch {
      setMe({ ok: false, error: "network_error" });
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/me", { cache: "no-store" });
        const json = (await res.json()) as MeResponse;
        if (!cancelled) setMe(json);
      } catch {
        if (!cancelled) setMe({ ok: false, error: "network_error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const fullName = me?.ok ? me.profile.full_name ?? "User" : "…";
  const role = me?.ok ? me.active_membership?.role_key ?? me.profile.role : "unknown";
  const companyName = me?.ok ? me.active_company?.name ?? "غرفة العمليات" : "غرفة العمليات";
  const companyLogoUrl = me?.ok ? me.active_company?.company_logo_url ?? null : null;

  const permissions = useMemo(() => {
    if (!me?.ok) return EMPTY_PERMISSIONS;
    if (me.active_membership?.effective_permissions) return me.active_membership.effective_permissions;
    return effectivePermissions(me.profile.role, (me.profile.permissions ?? null) as Record<string, unknown> | null);
  }, [me]);

  const companyOptions = useMemo(
    () =>
      me?.ok
        ? (me.memberships ?? [])
            .map((m) => ({
              company_id: m.company_id,
              company_name: m.company?.name ?? m.company_id,
            }))
        : [],
    [me],
  );

  const handleChangeCompany = async (companyId: string) => {
    if (!me?.ok) return;
    if (!companyId || companyId === me.profile.active_company_id) return;
    setSwitchingCompany(true);
    try {
      const res = await fetch("/api/me/active-company", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: companyId }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        toast.error(json.error ?? "تعذر تغيير الشركة النشطة.");
        return;
      }
      toast.success("تم التبديل إلى الشركة الجديدة.");
      await loadMe();
      window.location.reload();
    } finally {
      setSwitchingCompany(false);
    }
  };

  useEffect(() => {
    if (!mobileSidebarOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [mobileSidebarOpen]);

  return (
    <div className="flex min-h-dvh overflow-visible bg-[#f5f5ef] dark:bg-slate-950 md:flex-row-reverse">
      <LiveLocationTracker />
      {me?.ok ? (
        <DashboardSidebar
          fullName={fullName}
          role={role}
          isPlatformAdmin={Boolean(me.is_platform_admin)}
          permissions={permissions}
          collapsed={sidebarCollapsed}
          mobileOpen={mobileSidebarOpen}
          onCloseMobile={() => setMobileSidebarOpen(false)}
        />
      ) : null}
      <main className="min-w-0 flex-1 overflow-visible px-3 pb-24 md:px-5 md:pb-6">
        <DashboardTopbar
          fullName={fullName}
          loading={!me}
          companyName={companyName}
          companyLogoUrl={companyLogoUrl}
          memberships={companyOptions}
          activeCompanyId={me?.ok ? me.profile.active_company_id ?? null : null}
          switchingCompany={switchingCompany}
          onChangeCompany={handleChangeCompany}
          onOpenMobileNav={() => setMobileSidebarOpen(true)}
          onToggleSidebar={() => setSidebarCollapsed((v) => !v)}
          sidebarCollapsed={sidebarCollapsed}
        />
        <div className="min-h-0 pt-2 md:pt-3">
          <PageTransition>{children}</PageTransition>
        </div>
      </main>
      {me?.ok ? <DashboardBottomNav role={role} permissions={permissions} /> : null}
    </div>
  );
}

