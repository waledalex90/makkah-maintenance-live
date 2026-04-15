"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, CreditCard, RefreshCw, Shield, Users } from "lucide-react";
import { toast } from "sonner";

type OverviewTotals = {
  companies: number;
  active_tenant_status: number;
  suspended_tenants: number;
  expiring_subscriptions_14d: number;
  subscription_status_expired: number;
  active_members_across_tenants: number;
};

export function PlatformConsoleContent() {
  const queryClient = useQueryClient();

  const overview = useQuery({
    queryKey: ["platform-overview"],
    queryFn: async () => {
      const res = await fetch("/api/platform/overview", { cache: "no-store" });
      const json = (await res.json()) as { ok?: boolean; totals?: OverviewTotals; error?: string };
      if (!res.ok) throw new Error(json.error ?? "فشل تحميل ملخص المنصة");
      return json.totals!;
    },
    refetchInterval: 60_000,
  });

  const genInvoices = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/platform/invoices/generate", { method: "POST" });
      const json = (await res.json()) as { ok?: boolean; error?: string; generated?: number; skipped?: number };
      if (!res.ok) throw new Error(json.error ?? "تعذر توليد الفواتير");
      return json;
    },
    onSuccess: (data) => {
      toast.success(
        `تم توليد الفواتير: ${data.generated ?? 0} جديدة، تخطي ${data.skipped ?? 0}.`,
      );
      void queryClient.invalidateQueries({ queryKey: ["platform-overview"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const scanExpiry = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/platform/subscriptions/scan-expiry", { method: "POST" });
      const json = (await res.json()) as { ok?: boolean; error?: string; notified?: number };
      if (!res.ok) throw new Error(json.error ?? "تعذر فحص الاشتراكات");
      return json;
    },
    onSuccess: (data) => {
      toast.success(`تم فحص الاشتراكات${data.notified != null ? ` — إشعارات: ${data.notified}` : ""}.`);
      void queryClient.invalidateQueries({ queryKey: ["platform-overview"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const t = overview.data;

  return (
    <section className="space-y-6" dir="rtl" lang="ar">
      <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-5 text-white shadow-lg">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-300">منصة التشغيل</p>
        <h1 className="mt-1 text-2xl font-bold">لوحة تحكم المالك / مدير المنصة</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-300">
          من هنا تدير المستأجرين (الشركات)، الاشتراكات، والفوترة. عند اختيار شركة من القائمة العلوية تنتقل
          لعرض بياناتها الداخلية بصلاحيات مدير — كسياق تشغيلي داخل التينانت وليس كمستخدم عشوائي.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard
          icon={<Building2 className="h-5 w-5" />}
          label="إجمالي الشركات"
          value={overview.isLoading ? "…" : String(t?.companies ?? 0)}
          sub="مسجّلة على المنصة"
        />
        <MetricCard
          icon={<Users className="h-5 w-5" />}
          label="أعضاء نشطون (كل الشركات)"
          value={overview.isLoading ? "…" : String(t?.active_members_across_tenants ?? 0)}
          sub="عضويات active"
        />
        <MetricCard
          icon={<CreditCard className="h-5 w-5" />}
          label="اشتراكات تنتهي خلال ١٤ يوماً"
          value={overview.isLoading ? "…" : String(t?.expiring_subscriptions_14d ?? 0)}
          sub="يُنصح بمراجعة الفوترة"
        />
        <MetricCard
          icon={<Shield className="h-5 w-5" />}
          label="حالة tenant: نشطة"
          value={overview.isLoading ? "…" : String(t?.active_tenant_status ?? 0)}
          sub="حقل status في الشركة"
        />
        <MetricCard
          icon={<Building2 className="h-5 w-5" />}
          label="معلّقة / موقوفة"
          value={overview.isLoading ? "…" : String(t?.suspended_tenants ?? 0)}
          sub="حالة suspended"
        />
        <MetricCard
          icon={<RefreshCw className="h-5 w-5" />}
          label="انتهى الاشتراك (حقل)"
          value={overview.isLoading ? "…" : String(t?.subscription_status_expired ?? 0)}
          sub="subscription_status"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-slate-100 p-4">
          <h2 className="text-sm font-semibold text-slate-900">إدارة المستأجرين</h2>
          <p className="mt-1 text-xs text-slate-600">عرض وتعديل الباقات، حالة الحساب، وتواريخ الانتهاء.</p>
          <Link
            href="/dashboard/admin/companies"
            className="mt-3 inline-flex rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            فتح إدارة الشركات
          </Link>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-100 p-4">
          <h2 className="text-sm font-semibold text-slate-900">الأمان والمراقبة</h2>
          <p className="mt-1 text-xs text-slate-600">أحداث ٤٠٣ ومحاولات رفض Tenant Guard.</p>
          <Link
            href="/dashboard/admin/monitoring"
            className="mt-3 inline-flex rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
          >
            لوحة مراقبة الأمان
          </Link>
        </div>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <h2 className="text-sm font-semibold text-amber-950">عمليات دورية (يدوية)</h2>
        <p className="mt-1 text-xs text-amber-900/90">
          عادةً تُجدول عبر Cron مع سرّ <code className="rounded bg-amber-100 px-1">BILLING_CRON_SECRET</code>؛ يمكنك
          تشغيلها هنا للاختبار.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={genInvoices.isPending}
            onClick={() => genInvoices.mutate()}
            className="rounded-lg bg-amber-800 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          >
            {genInvoices.isPending ? "جاري…" : "توليد فواتير شهرية"}
          </button>
          <button
            type="button"
            disabled={scanExpiry.isPending}
            onClick={() => scanExpiry.mutate()}
            className="rounded-lg border border-amber-700 bg-white px-3 py-1.5 text-xs font-medium text-amber-950 disabled:opacity-50"
          >
            {scanExpiry.isPending ? "جاري…" : "فحص انتهاء الاشتراكات"}
          </button>
        </div>
      </div>
    </section>
  );
}

function MetricCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="flex gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700">{icon}</div>
      <div>
        <p className="text-xs text-slate-500">{label}</p>
        <p className="text-2xl font-semibold text-slate-900">{value}</p>
        <p className="text-[11px] text-slate-400">{sub}</p>
      </div>
    </div>
  );
}
