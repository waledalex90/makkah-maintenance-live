"use client";

import { ThemeToggle } from "@/components/theme-toggle";
import { LogoutIconButton } from "@/components/logout-icon-button";

type DashboardTopbarProps = {
  fullName: string;
};

export function DashboardTopbar({ fullName }: DashboardTopbarProps) {
  return (
    <header className="mb-4 flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{fullName}</p>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <LogoutIconButton />
      </div>
    </header>
  );
}
