import Link from "next/link";

export default function SuspendedSubscriptionPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4" dir="rtl" lang="ar">
      <section className="w-full max-w-lg rounded-2xl border border-amber-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">الاشتراك معلق</h1>
        <p className="mt-3 text-sm leading-7 text-slate-700">
          عفواً، الاشتراك معلق.. يرجى مراجعة إدارة المنصة للتجديد.
        </p>
        <p className="mt-2 text-xs text-slate-500">
          لا يمكن الوصول لبيانات التشغيل حتى يتم تفعيل الاشتراك مرة أخرى.
        </p>
        <div className="mt-5">
          <Link
            href="/login"
            className="inline-flex rounded-lg border border-slate-300 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100"
          >
            الرجوع لتسجيل الدخول
          </Link>
        </div>
      </section>
    </main>
  );
}
