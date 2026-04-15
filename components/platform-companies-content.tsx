"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, LogIn } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

type CompanyRow = {
  id: string;
  name: string;
  slug: string;
  subscription_plan: string;
  status: string;
  subscription_status?: string;
  subscription_expires_at?: string | null;
  billing_email?: string | null;
  created_at: string;
  active_members: number;
};

type PlanRow = { plan_key: string; display_name: string };

const COMPANY_STATUSES = [
  { value: "active", label: "نشطة" },
  { value: "trial", label: "تجريبي" },
  { value: "suspended", label: "معلّقة" },
  { value: "cancelled", label: "ملغاة" },
];

const SUB_STATUSES = [
  { value: "active", label: "اشتراك نشط" },
  { value: "trial", label: "تجريبي" },
  { value: "past_due", label: "متأخر السداد" },
  { value: "expired", label: "منتهٍ" },
  { value: "cancelled", label: "ملغى" },
];

export function PlatformCompaniesContent() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["platform-companies"],
    queryFn: async () => {
      const res = await fetch("/api/platform/companies", { cache: "no-store" });
      const json = (await res.json()) as { companies?: CompanyRow[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed loading companies");
      return json.companies ?? [];
    },
    refetchInterval: 20_000,
  });

  const plansQuery = useQuery({
    queryKey: ["platform-subscription-plans"],
    queryFn: async () => {
      const res = await fetch("/api/platform/subscription-plans", { cache: "no-store" });
      const json = (await res.json()) as { plans?: PlanRow[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? "plans");
      return json.plans ?? [];
    },
  });

  const [editing, setEditing] = useState<CompanyRow | null>(null);
  const [form, setForm] = useState({
    name: "",
    subscription_plan: "",
    status: "",
    subscription_status: "",
    subscription_expires_at: "",
    billing_email: "",
  });

  useEffect(() => {
    if (!editing) return;
    const exp = editing.subscription_expires_at
      ? new Date(editing.subscription_expires_at).toISOString().slice(0, 16)
      : "";
    setForm({
      name: editing.name,
      subscription_plan: editing.subscription_plan,
      status: editing.status,
      subscription_status: editing.subscription_status ?? "active",
      subscription_expires_at: exp,
      billing_email: editing.billing_email ?? "",
    });
  }, [editing]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        subscription_plan: form.subscription_plan,
        status: form.status,
        subscription_status: form.subscription_status,
        billing_email: form.billing_email.trim() || null,
      };
      if (form.subscription_expires_at) {
        payload.subscription_expires_at = new Date(form.subscription_expires_at).toISOString();
      } else {
        payload.subscription_expires_at = null;
      }
      const res = await fetch(`/api/platform/companies/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error ?? "فشل الحفظ");
    },
    onSuccess: () => {
      toast.success("تم حفظ بيانات الشركة.");
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: ["platform-companies"] });
      void queryClient.invalidateQueries({ queryKey: ["platform-overview"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const enterCompany = useMutation({
    mutationFn: async (companyId: string) => {
      const res = await fetch("/api/me/active-company", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: companyId }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error ?? "تعذر تغيير الشركة النشطة");
    },
    onSuccess: () => {
      toast.success("تم الانتقال إلى بيانات الشركة.");
      window.location.assign("/dashboard");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const companies = query.data ?? [];

  return (
    <section className="rounded-xl border border-slate-200 bg-slate-100 p-4" dir="rtl" lang="ar">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">إدارة الشركات</h1>
          <p className="mt-1 text-xs text-slate-600">
            المستأجرون على المنصة: الباقة، حالة الحساب، حالة الاشتراك، وتاريخ الانتهاء. استخدم «دخول بيانات الشركة»
            لفتح التينانت في الواجهة الرئيسية (صلاحيات مدير من المنصة).
          </p>
        </div>
        <a
          href="/dashboard/admin/platform"
          className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50"
        >
          ← العودة للوحة المنصة
        </a>
      </div>

      <div className="mt-4 overflow-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-[1100px] w-full text-right text-sm">
          <thead className="bg-slate-50 text-slate-700">
            <tr>
              <th className="px-3 py-2">الشركة</th>
              <th className="px-3 py-2">Slug</th>
              <th className="px-3 py-2">الباقة</th>
              <th className="px-3 py-2">الحالة</th>
              <th className="px-3 py-2">الاشتراك</th>
              <th className="px-3 py-2">ينتهي</th>
              <th className="px-3 py-2">الأعضاء النشطون</th>
              <th className="px-3 py-2">تاريخ الإنشاء</th>
              <th className="px-3 py-2 w-28">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {query.isLoading ? (
              <tr>
                <td className="px-3 py-6 text-center text-slate-500" colSpan={9}>
                  جاري التحميل...
                </td>
              </tr>
            ) : companies.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-center text-slate-500" colSpan={9}>
                  لا توجد شركات.
                </td>
              </tr>
            ) : (
              companies.map((company) => (
                <tr key={company.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium text-slate-900">{company.name}</td>
                  <td className="px-3 py-2 text-xs text-slate-600">{company.slug}</td>
                  <td className="px-3 py-2">{company.subscription_plan}</td>
                  <td className="px-3 py-2">{company.status}</td>
                  <td className="px-3 py-2 text-xs">{company.subscription_status ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-slate-600">
                    {company.subscription_expires_at
                      ? new Date(company.subscription_expires_at).toLocaleString("ar-SA")
                      : "—"}
                  </td>
                  <td className="px-3 py-2">{company.active_members}</td>
                  <td className="px-3 py-2 text-xs text-slate-500">
                    {new Date(company.created_at).toLocaleString("ar-SA")}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1 justify-end">
                      <button
                        type="button"
                        onClick={() => setEditing(company)}
                        className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-xs hover:bg-slate-50"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        تعديل
                      </button>
                      <button
                        type="button"
                        disabled={enterCompany.isPending}
                        onClick={() => enterCompany.mutate(company.id)}
                        className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
                      >
                        <LogIn className="h-3.5 w-3.5" />
                        دخول
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Sheet open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <SheetContent className="overflow-y-auto" dir="rtl">
          <SheetHeader>
            <SheetTitle>تعديل شركة</SheetTitle>
            <SheetDescription>تحديث الباقة وحالة الحساب وتاريخ انتهاء الاشتراك.</SheetDescription>
          </SheetHeader>
          {editing ? (
            <form
              className="mt-6 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                saveMutation.mutate();
              }}
            >
              <label className="block text-xs font-medium text-slate-700">
                الاسم
                <input
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  required
                />
              </label>
              <label className="block text-xs font-medium text-slate-700">
                الباقة
                <select
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  value={form.subscription_plan}
                  onChange={(e) => setForm((f) => ({ ...f, subscription_plan: e.target.value }))}
                >
                  {(plansQuery.data ?? []).length > 0 ? (
                    (plansQuery.data ?? []).map((p) => (
                      <option key={p.plan_key} value={p.plan_key}>
                        {p.display_name} ({p.plan_key})
                      </option>
                    ))
                  ) : (
                    <option value={form.subscription_plan}>{form.subscription_plan}</option>
                  )}
                </select>
              </label>
              <label className="block text-xs font-medium text-slate-700">
                حالة الشركة (tenant)
                <select
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                >
                  {COMPANY_STATUSES.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-medium text-slate-700">
                حالة الاشتراك
                <select
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  value={form.subscription_status}
                  onChange={(e) => setForm((f) => ({ ...f, subscription_status: e.target.value }))}
                >
                  {SUB_STATUSES.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-medium text-slate-700">
                ينتهي في (اختياري)
                <input
                  type="datetime-local"
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  value={form.subscription_expires_at}
                  onChange={(e) => setForm((f) => ({ ...f, subscription_expires_at: e.target.value }))}
                />
              </label>
              <label className="block text-xs font-medium text-slate-700">
                بريد الفوترة
                <input
                  type="email"
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  value={form.billing_email}
                  onChange={(e) => setForm((f) => ({ ...f, billing_email: e.target.value }))}
                  placeholder="billing@company.com"
                />
              </label>
              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={saveMutation.isPending}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {saveMutation.isPending ? "جاري الحفظ…" : "حفظ"}
                </button>
                <button type="button" className="rounded-lg border border-slate-200 px-4 py-2 text-sm" onClick={() => setEditing(null)}>
                  إلغاء
                </button>
              </div>
            </form>
          ) : null}
        </SheetContent>
      </Sheet>
    </section>
  );
}
