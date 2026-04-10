"use client";

import { ThemeToggle } from "@/components/theme-toggle";

type DashboardTopbarProps = {
  fullName: string;
};

export function DashboardTopbar({ fullName }: DashboardTopbarProps) {
  return (
    <header className="mb-4 flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{fullName}</p>
      <ThemeToggle />
    </header>
  );
}
