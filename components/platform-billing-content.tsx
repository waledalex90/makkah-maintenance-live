"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

type InvoiceRow = {
  id: string;
  company_id: string;
  invoice_number: string | null;
  invoice_status: string;
  amount: number | null;
  currency: string | null;
  due_at: string | null;
  issued_at: string | null;
  paid_at: string | null;
  created_at: string;
  company?: { name?: string; slug?: string } | null;
};

export function PlatformBillingContent() {
  const [statusFilter, setStatusFilter] = useState<"all" | "issued" | "overdue" | "paid" | "void">("all");
  const query = useQuery({
    queryKey: ["platform-invoices"],
    queryFn: async () => {
      const res = await fetch("/api/platform/invoices", { cache: "no-store" });
      const json = (await res.json()) as { ok?: boolean; invoices?: InvoiceRow[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? "failed loading invoices");
      return json.invoices ?? [];
    },
    refetchInterval: 30_000,
  });

  const rows = query.data ?? [];
  const filtered = useMemo(
    () => (statusFilter === "all" ? rows : rows.filter((r) => r.invoice_status === statusFilter)),
    [rows, statusFilter],
  );

  return (
    <section className="rounded-xl border border-slate-200 bg-slate-100 p-4" dir="rtl" lang="ar">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">فواتير المنصة</h1>
          <p className="mt-1 text-xs text-slate-600">متابعة الفواتير الصادرة، المستحقة، وOverdue على مستوى كل الشركات.</p>
        </div>
        <select
          className="h-9 rounded-md border border-slate-200 bg-white px-2 text-xs"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
        >
          <option value="all">كل الحالات</option>
          <option value="issued">Issued</option>
          <option value="overdue">Overdue</option>
          <option value="paid">Paid</option>
          <option value="void">Void</option>
        </select>
      </div>

      <div className="mt-4 overflow-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-[1100px] w-full text-right text-sm">
          <thead className="bg-slate-50 text-slate-700">
            <tr>
              <th className="px-3 py-2">الرقم</th>
              <th className="px-3 py-2">الشركة</th>
              <th className="px-3 py-2">الحالة</th>
              <th className="px-3 py-2">المبلغ</th>
              <th className="px-3 py-2">الاستحقاق</th>
              <th className="px-3 py-2">الإصدار</th>
              <th className="px-3 py-2">السداد</th>
            </tr>
          </thead>
          <tbody>
            {query.isLoading ? (
              <tr>
                <td className="px-3 py-6 text-center text-slate-500" colSpan={7}>جاري التحميل...</td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-center text-slate-500" colSpan={7}>لا توجد فواتير.</td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 text-xs">{row.invoice_number ?? row.id}</td>
                  <td className="px-3 py-2">
                    <p className="font-medium text-slate-900">{row.company?.name ?? row.company_id}</p>
                    <p className="text-[11px] text-slate-500">{row.company?.slug ?? "-"}</p>
                  </td>
                  <td className="px-3 py-2"><StatusChip status={row.invoice_status} /></td>
                  <td className="px-3 py-2">{Number(row.amount ?? 0).toFixed(2)} {(row.currency ?? "SAR").toUpperCase()}</td>
                  <td className="px-3 py-2 text-xs">{row.due_at ? new Date(row.due_at).toLocaleString("ar-SA") : "-"}</td>
                  <td className="px-3 py-2 text-xs">{row.issued_at ? new Date(row.issued_at).toLocaleString("ar-SA") : "-"}</td>
                  <td className="px-3 py-2 text-xs">{row.paid_at ? new Date(row.paid_at).toLocaleString("ar-SA") : "-"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function StatusChip({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  if (normalized === "paid") return <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">Paid</span>;
  if (normalized === "overdue") return <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-800">Overdue</span>;
  if (normalized === "issued") return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">Issued</span>;
  return <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-800">{status}</span>;
}
