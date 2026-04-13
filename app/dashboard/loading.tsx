export default function DashboardLoading() {
  return (
    <div className="space-y-4 p-2" dir="rtl" lang="ar">
      <div className="rounded-xl border border-emerald-900/20 bg-white p-4 dark:border-emerald-900/40 dark:bg-slate-900">
        <div className="h-5 w-44 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
        <div className="mt-3 h-4 w-72 max-w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="h-24 animate-pulse rounded-xl border border-[#d4af37]/30 bg-white dark:border-amber-700/30 dark:bg-slate-900" />
        <div className="h-24 animate-pulse rounded-xl border border-[#d4af37]/30 bg-white dark:border-amber-700/30 dark:bg-slate-900" />
        <div className="h-24 animate-pulse rounded-xl border border-[#d4af37]/30 bg-white dark:border-amber-700/30 dark:bg-slate-900" />
      </div>
      <div className="h-[42vh] animate-pulse rounded-xl border border-emerald-900/20 bg-white dark:border-emerald-900/40 dark:bg-slate-900" />
    </div>
  );
}

