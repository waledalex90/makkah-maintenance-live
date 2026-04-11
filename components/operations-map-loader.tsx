"use client";

import dynamic from "next/dynamic";

const OperationsMap = dynamic(
  () => import("@/components/operations-map").then((m) => m.OperationsMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[72vh] w-full items-center justify-center rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/40">
        <p className="text-sm font-medium text-slate-800 dark:text-slate-100">جاري تحميل الخريطة…</p>
      </div>
    ),
  },
);

export function OperationsMapLoader() {
  return <OperationsMap />;
}
