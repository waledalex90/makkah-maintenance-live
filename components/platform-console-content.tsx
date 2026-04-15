"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Building2, CreditCard, TriangleAlert, Users } from "lucide-react";

type OverviewTotals = {
  companies: number;
  active_tenant_status: number;
  suspended_tenants: number;
  expiring_subscriptions_14d: number;
  subscription_status_expired: number;
  active_members_across_tenants: number;
  due_invoices: number;
  overdue_invoices: number;
  due_invoices_amount: number;
};

export function PlatformConsoleContent() {
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

  const t = overview.data;

  return (
    <section className="space-y-6" dir="rtl" lang="ar">
      <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-5 text-white shadow-lg">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-300">Command Center</p>
        <h1 className="mt-1 text-2xl font-bold">لوحة التحكم المركزية للمنصة</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-300">
          هذه الشاشة مخصصة لملخص أعمال المنصة فقط (الشركات، المستخدمون، والفواتير). تفاصيل التشغيل الميداني
          تظهر فقط بعد الدخول إلى سياق شركة.
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
          label="فواتير مستحقة حالياً"
          value={overview.isLoading ? "…" : String(t?.due_invoices ?? 0)}
          sub="لم تُدفع بعد تاريخ الاستحقاق"
        />
        <MetricCard
          icon={<TriangleAlert className="h-5 w-5" />}
          label="فواتير Overdue"
          value={overview.isLoading ? "…" : String(t?.overdue_invoices ?? 0)}
          sub="بعد 24 ساعة من الاستحقاق"
        />
        <MetricCard
          icon={<CreditCard className="h-5 w-5" />}
          label="قيمة المستحقات"
          value={overview.isLoading ? "…" : `${Number(t?.due_invoices_amount ?? 0).toFixed(2)} SAR`}
          sub="إجمالي الفواتير المستحقة"
        />
        <MetricCard
          icon={<Building2 className="h-5 w-5" />}
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
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-slate-100 p-4">
          <h2 className="text-sm font-semibold text-slate-900">المنشآت والشركات</h2>
          <p className="mt-1 text-xs text-slate-600">إدارة حالة الشركة والاشتراك والدخول التشغيلي.</p>
          <Link
            href="/dashboard/admin/companies"
            className="mt-3 inline-flex rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            فتح إدارة الشركات
          </Link>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-100 p-4">
          <h2 className="text-sm font-semibold text-slate-900">الفواتير والتحصيل</h2>
          <p className="mt-1 text-xs text-slate-600">مراجعة الصادر والمستحق وOverdue.</p>
          <Link
            href="/dashboard/admin/billing"
            className="mt-3 inline-flex rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
          >
            فتح الفواتير
          </Link>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-100 p-4">
          <h2 className="text-sm font-semibold text-slate-900">الإعدادات العالمية</h2>
          <p className="mt-1 text-xs text-slate-600">خيارات المنصة العامة والتهيئة المركزية.</p>
          <Link
            href="/dashboard/admin/platform-settings"
            className="mt-3 inline-flex rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
          >
            فتح الإعدادات العالمية
          </Link>
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
