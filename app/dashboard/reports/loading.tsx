function ReportCardSkeleton() {
  return (
    <div className="rounded-2xl border border-slate-700/80 bg-slate-900/60 p-5">
      <div className="h-3 w-24 animate-pulse rounded bg-slate-700" />
      <div className="mt-3 h-7 w-40 animate-pulse rounded bg-slate-700" />
      <div className="mt-2 h-3 w-56 animate-pulse rounded bg-slate-800" />
    </div>
  );
}

export default function ReportsLoading() {
  return (
    <div className="min-h-[70vh] bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-4 pb-12 pt-6" dir="rtl" lang="ar">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="rounded-2xl border border-slate-700/80 bg-slate-900/60 p-6">
          <div className="h-6 w-52 animate-pulse rounded bg-slate-700" />
          <div className="mt-3 h-4 w-80 max-w-full animate-pulse rounded bg-slate-800" />
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <ReportCardSkeleton />
          <ReportCardSkeleton />
          <ReportCardSkeleton />
        </div>

        <div className="rounded-2xl border border-slate-700/80 bg-slate-900/60 p-6">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
          <p className="text-center text-sm text-slate-300">جاري تحميل بيانات التقارير…</p>
        </div>
      </div>
    </div>
  );
}

