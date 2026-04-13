"use client";

import { useEffect, useMemo, useState } from "react";
import { Menu, PanelRightClose, PanelRightOpen } from "lucide-react";
import { LogoutIconButton } from "@/components/logout-icon-button";

type DashboardTopbarProps = {
  fullName: string;
  onOpenMobileNav: () => void;
  onToggleSidebar: () => void;
  sidebarCollapsed: boolean;
};

export function DashboardTopbar({
  fullName,
  onOpenMobileNav,
  onToggleSidebar,
  sidebarCollapsed,
}: DashboardTopbarProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const makkahTime = useMemo(
    () =>
      new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Riyadh",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(now),
    [now],
  );

  return (
    <header className="sticky top-0 z-[8050] mb-3 h-16 border border-slate-200 bg-slate-50/95 px-3 shadow-2xl backdrop-blur md:mb-4 md:h-20 md:px-4">
      <div className="flex h-full items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 md:gap-3">
          <button
            type="button"
            aria-label="فتح القائمة"
            onClick={onOpenMobileNav}
            className="rounded-xl border border-slate-200 bg-white p-2 text-slate-900 md:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label="طي أو توسيع القائمة الجانبية"
            onClick={onToggleSidebar}
            className="hidden rounded-xl border border-slate-200 bg-white p-2 text-slate-900 md:inline-flex"
          >
            {sidebarCollapsed ? <PanelRightOpen className="h-4 w-4" /> : <PanelRightClose className="h-4 w-4" />}
          </button>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{fullName}</p>
            <p className="text-[11px] text-amber-600">غرفة عمليات الحج - مكة</p>
          </div>
        </div>

        <div className="hidden items-center gap-2 rounded-xl border border-slate-200 bg-slate-100 px-3 py-1.5 md:flex">
          <span className="text-xs font-semibold text-emerald-600">Live Makkah</span>
          <span className="text-xs text-slate-400">|</span>
          <span className="font-mono text-sm font-semibold text-slate-900">{makkahTime}</span>
          <span className="text-xs text-slate-400">|</span>
          <span className="text-xs text-amber-500">Temp 34C</span>
        </div>

        <div className="flex items-center gap-2">
          <div className="rounded-xl border border-slate-200 px-2 py-1 font-mono text-xs text-slate-900 md:hidden">
            {makkahTime}
          </div>
          <LogoutIconButton />
        </div>
      </div>
      <div className="md:hidden">
        <div className="mt-1 rounded-xl border border-slate-200 bg-slate-100 px-2 py-1 text-center text-[11px] text-amber-500">
          Live Makkah Status - Temp 34C
        </div>
      </div>
      <div className="pointer-events-none absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-emerald-600 via-amber-500 to-emerald-600" />
    </header>
  );
}
