"use client";

import { useEffect, useMemo, useState } from "react";
import { Menu, PanelRightClose, PanelRightOpen } from "lucide-react";

type DashboardTopbarProps = {
  fullName: string;
  loading?: boolean;
  companyName?: string;
  companyLogoUrl?: string | null;
  platformMode?: boolean;
  memberships?: Array<{ company_id: string; company_name: string }>;
  activeCompanyId?: string | null;
  /** قيمة خيار «المنصة بدون شركة» في القائمة */
  platformContextSelectValue?: string;
  showCompanySwitcher?: boolean;
  showReturnToPlatform?: boolean;
  showClearCacheReset?: boolean;
  switchingCompany?: boolean;
  onChangeCompany?: (companyId: string) => void;
  onReturnToPlatform?: () => void;
  onClearCacheReset?: () => void;
  onOpenMobileNav: () => void;
  onToggleSidebar: () => void;
  sidebarCollapsed: boolean;
};

export function DashboardTopbar({
  fullName,
  loading = false,
  companyName,
  companyLogoUrl,
  platformMode = false,
  memberships = [],
  activeCompanyId = null,
  platformContextSelectValue = "__platform__",
  showCompanySwitcher = false,
  showReturnToPlatform = false,
  showClearCacheReset = false,
  switchingCompany = false,
  onChangeCompany,
  onReturnToPlatform,
  onClearCacheReset,
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
    <header className="relative mb-3 h-16 border border-slate-200 bg-slate-50 px-3 shadow-2xl md:mb-4 md:h-20 md:px-4" dir="rtl" lang="ar">
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
            {loading ? (
              <div className="space-y-1">
                <div className="h-3 w-24 animate-pulse rounded bg-slate-200" />
                <div className="h-2.5 w-28 animate-pulse rounded bg-slate-200" />
              </div>
            ) : (
              <>
                <p className="truncate text-sm font-semibold text-slate-900">{fullName}</p>
                <p className="truncate text-[11px] text-amber-600">{platformMode ? "المركز الرئيسي للمنصة" : (companyName || "غرفة العمليات")}</p>
              </>
            )}
          </div>
        </div>

        <div className="hidden items-center gap-2 rounded-xl border border-slate-200 bg-slate-100 px-3 py-1.5 md:flex">
          {!platformMode && companyLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={companyLogoUrl} alt={companyName || "company logo"} className="h-6 w-6 rounded-full border border-slate-200 bg-white object-cover" />
          ) : null}
          {showCompanySwitcher && onChangeCompany ? (
            <select
              className="h-8 max-w-[200px] rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700"
              value={activeCompanyId ?? platformContextSelectValue}
              disabled={switchingCompany}
              onChange={(e) => onChangeCompany(e.target.value)}
              title="الشركة النشطة أو المنصة"
            >
              {memberships.map((m) => (
                <option key={m.company_id} value={m.company_id}>
                  {m.company_name}
                </option>
              ))}
            </select>
          ) : null}
          {showReturnToPlatform && onReturnToPlatform ? (
            <button
              type="button"
              onClick={onReturnToPlatform}
              disabled={switchingCompany}
              className="rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-900 hover:bg-indigo-100 disabled:opacity-50"
            >
              العودة للوحة المنصة
            </button>
          ) : null}
          {showClearCacheReset && onClearCacheReset ? (
            <button
              type="button"
              onClick={onClearCacheReset}
              className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-900 hover:bg-rose-100"
            >
              Clear Cache &amp; Reset
            </button>
          ) : null}
          {platformMode ? (
            <span className="text-xs font-semibold text-indigo-700">Platform Mode</span>
          ) : (
            <>
              <span className="text-sm leading-none" aria-hidden="true">🕋</span>
              <span className="text-xs font-semibold text-emerald-600">Live Makkah</span>
            </>
          )}
          <span className="text-xs text-slate-400">|</span>
          <span className="font-mono text-sm font-semibold text-slate-900">{makkahTime}</span>
          {!platformMode ? (
            <>
              <span className="text-xs text-slate-400">|</span>
              <span className="text-xs text-amber-500">Temp 34C</span>
            </>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          {!platformMode ? <span className="text-sm leading-none md:hidden" aria-hidden="true">🕋</span> : null}
          <div className="rounded-xl border border-slate-200 px-2 py-1 font-mono text-xs text-slate-900 md:hidden">
            {makkahTime}
          </div>
        </div>
      </div>
      <div className="md:hidden">
        {showCompanySwitcher && onChangeCompany ? (
          <div className="mt-2">
            <select
              className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-800"
              value={activeCompanyId ?? platformContextSelectValue}
              disabled={switchingCompany}
              onChange={(e) => onChangeCompany(e.target.value)}
            >
              {memberships.map((m) => (
                <option key={m.company_id} value={m.company_id}>
                  {m.company_name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {showReturnToPlatform && onReturnToPlatform ? (
          <button
            type="button"
            onClick={onReturnToPlatform}
            disabled={switchingCompany}
            className="mt-2 h-9 w-full rounded-lg border border-indigo-200 bg-indigo-50 px-2 text-xs font-semibold text-indigo-900 disabled:opacity-50"
          >
            العودة للوحة المنصة
          </button>
        ) : null}
        {showClearCacheReset && onClearCacheReset ? (
          <button
            type="button"
            onClick={onClearCacheReset}
            className="mt-2 h-9 w-full rounded-lg border border-rose-200 bg-rose-50 px-2 text-xs font-semibold text-rose-900"
          >
            Clear Cache &amp; Reset
          </button>
        ) : null}
        {!platformMode ? (
          <div className="mt-1 rounded-xl border border-slate-200 bg-slate-100 px-2 py-1 text-center text-[11px] text-amber-500">
            Live Makkah Status - Temp 34C
          </div>
        ) : null}
      </div>
    </header>
  );
}
