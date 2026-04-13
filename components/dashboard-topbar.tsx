"use client";

import { useEffect, useMemo, useState } from "react";
import { Menu, PanelRightClose, PanelRightOpen } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
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
    <header className="sticky top-0 z-[8050] mb-3 h-16 border border-emerald-900/20 bg-[#f8f7f2]/95 px-3 shadow-sm backdrop-blur md:mb-4 md:h-20 md:px-4 dark:border-emerald-900/40 dark:bg-slate-950/95">
      <div className="flex h-full items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 md:gap-3">
          <button
            type="button"
            aria-label="فتح القائمة"
            onClick={onOpenMobileNav}
            className="rounded-md border border-emerald-800/30 bg-white p-2 text-emerald-950 md:hidden dark:border-emerald-700/40 dark:bg-slate-900 dark:text-emerald-300"
          >
            <Menu className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label="طي أو توسيع القائمة الجانبية"
            onClick={onToggleSidebar}
            className="hidden rounded-md border border-emerald-800/30 bg-white p-2 text-emerald-950 md:inline-flex dark:border-emerald-700/40 dark:bg-slate-900 dark:text-emerald-300"
          >
            {sidebarCollapsed ? <PanelRightOpen className="h-4 w-4" /> : <PanelRightClose className="h-4 w-4" />}
          </button>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[#064e3b] dark:text-emerald-200">{fullName}</p>
            <p className="text-[11px] text-[#7c6325] dark:text-amber-300">عمليات الحج - مكة</p>
          </div>
        </div>

        <div className="hidden items-center gap-2 rounded-lg border border-[#d4af37]/40 bg-white px-3 py-1.5 md:flex dark:border-amber-600/50 dark:bg-slate-900">
          <span className="text-xs font-semibold text-[#064e3b] dark:text-emerald-300">Live Makkah</span>
          <span className="text-xs text-slate-400">|</span>
          <span className="font-mono text-sm font-semibold text-[#064e3b] dark:text-emerald-200">{makkahTime}</span>
          <span className="text-xs text-slate-400">|</span>
          <span className="text-xs text-[#7c6325] dark:text-amber-300">Temp 34C</span>
        </div>

        <div className="flex items-center gap-2">
          <div className="rounded-md border border-[#d4af37]/40 px-2 py-1 font-mono text-xs text-[#064e3b] md:hidden dark:border-amber-600/50 dark:text-emerald-300">
            {makkahTime}
          </div>
          <ThemeToggle />
          <LogoutIconButton />
        </div>
      </div>
      <div className="md:hidden">
        <div className="mt-1 rounded-md border border-[#d4af37]/40 bg-white px-2 py-1 text-center text-[11px] text-[#7c6325] dark:border-amber-600/50 dark:bg-slate-900 dark:text-amber-300">
          Live Makkah Status - Temp 34C
        </div>
      </div>
      <div className="pointer-events-none absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-[#064e3b] via-[#d4af37] to-[#064e3b]" />
    </header>
  );
}
