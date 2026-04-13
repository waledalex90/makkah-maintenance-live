"use client";

import { useEffect, useMemo, useState } from "react";
import { DashboardSidebar } from "@/components/dashboard-sidebar";
import { LiveLocationTracker } from "@/components/live-location-tracker";
import { DashboardBottomNav } from "@/components/dashboard-bottom-nav";
import { PageTransition } from "@/components/page-transition";
import { DashboardTopbar } from "@/components/dashboard-topbar";
import { effectivePermissions } from "@/lib/permissions";
import type { AppPermissionKey } from "@/lib/permissions";

type MeResponse =
  | {
      ok: true;
      profile: {
        full_name: string | null;
        role: string;
        permissions: Record<string, unknown> | null;
      };
    }
  | { ok: false; error: string };

const EMPTY_PERMISSIONS = {} as Record<AppPermissionKey, boolean>;

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<MeResponse | null>(null);

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
  const role = me?.ok ? me.profile.role : "unknown";

  const permissions = useMemo(() => {
    if (!me?.ok) return EMPTY_PERMISSIONS;
    return effectivePermissions(me.profile.role, (me.profile.permissions ?? null) as Record<string, unknown> | null);
  }, [me]);

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950">
      <LiveLocationTracker />
      {me?.ok ? <DashboardSidebar fullName={fullName} role={role} permissions={permissions} /> : null}
      <main className="flex-1 p-4 pb-24 md:p-6 md:pb-6">
        <DashboardTopbar fullName={fullName} />
        <PageTransition>{children}</PageTransition>
      </main>
      {me?.ok ? <DashboardBottomNav role={role} permissions={permissions} /> : null}
    </div>
  );
}

