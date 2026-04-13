"use client";

import dynamic from "next/dynamic";

const ReportsAnalyticsDashboard = dynamic(
  () => import("@/components/reports-analytics-dashboard").then((m) => m.ReportsAnalyticsDashboard),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[45vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
      </div>
    ),
  },
);

export function ReportsPageClient() {
  return <ReportsAnalyticsDashboard />;
}

