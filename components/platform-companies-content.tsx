"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, LogIn, Plus, RotateCcw, PauseCircle, Search, SlidersHorizontal } from "lucide-react";
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
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | string>("all");
  const [subscriptionFilter, setSubscriptionFilter] = useState<"all" | string>("all");
  const [membersFilter, setMembersFilter] = useState<"all" | "0" | "1-5" | "6-20" | "21+">("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: "",
    slug: "",
    subscription_plan: "basic",
    status: "trial",
    subscription_status: "trial",
    billing_email: "",
  });
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

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        name: createForm.name.trim(),
        subscription_plan: createForm.subscription_plan,
        status: createForm.status,
        subscription_status: createForm.subscription_status,
        billing_email: createForm.billing_email.trim() || null,
      };
      const slug = createForm.slug.trim();
      if (slug) payload.slug = slug;
      const res = await fetch("/api/platform/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error ?? "فشل إنشاء الشركة");
    },
    onSuccess: () => {
      toast.success("تم إنشاء الشركة.");
      setCreateOpen(false);
      setCreateForm({
        name: "",
        slug: "",
        subscription_plan: "basic",
        status: "trial",
        subscription_status: "trial",
        billing_email: "",
      });
      void queryClient.invalidateQueries({ queryKey: ["platform-companies"] });
      void queryClient.invalidateQueries({ queryKey: ["platform-overview"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

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

  const quickSubscriptionMutation = useMutation({
    mutationFn: async (payload: { companyId: string; action: "renew" | "suspend" }) => {
      const res = await fetch(`/api/platform/companies/${payload.companyId}/subscription-actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: payload.action }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error ?? "فشل العملية");
    },
    onSuccess: (_, vars) => {
      toast.success(vars.action === "renew" ? "تم تجديد الاشتراك بنجاح." : "تم تعليق الشركة والاشتراك.");
      void queryClient.invalidateQueries({ queryKey: ["platform-companies"] });
      void queryClient.invalidateQueries({ queryKey: ["platform-overview"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const companies = query.data ?? [];
  const filteredCompanies = useMemo(() => {
    const term = search.trim().toLowerCase();
    return companies.filter((company) => {
      if (statusFilter !== "all" && company.status !== statusFilter) return false;
      if (subscriptionFilter !== "all" && (company.subscription_status ?? "active") !== subscriptionFilter) return false;
      if (membersFilter !== "all") {
        const n = company.active_members;
        if (membersFilter === "0" && n !== 0) return false;
        if (membersFilter === "1-5" && (n < 1 || n > 5)) return false;
        if (membersFilter === "6-20" && (n < 6 || n > 20)) return false;
        if (membersFilter === "21+" && n < 21) return false;
      }
      if (!term) return true;
      return (
        company.name.toLowerCase().includes(term) ||
        company.slug.toLowerCase().includes(term) ||
        company.subscription_plan.toLowerCase().includes(term)
      );
    });
  }, [companies, membersFilter, search, statusFilter, subscriptionFilter]);

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
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
          >
            <Plus className="h-3.5 w-3.5" />
            إضافة شركة
          </button>
          <a
            href="/dashboard/admin/platform"
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50"
          >
            ← العودة للوحة المنصة
          </a>
        </div>
      </div>

      <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute right-2 top-2.5 h-4 w-4 text-slate-400" />
            <input
              className="h-9 w-full rounded-md border border-slate-200 pr-8 pl-2 text-sm"
              placeholder="بحث بالاسم أو slug أو الباقة..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="inline-flex items-center gap-1 text-xs text-slate-500">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            فلاتر
          </div>
          <select
            className="h-9 rounded-md border border-slate-200 bg-white px-2 text-xs"
            value={subscriptionFilter}
            onChange={(e) => setSubscriptionFilter(e.target.value)}
          >
            <option value="all">كل حالات الاشتراك</option>
            {SUB_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <select
            className="h-9 rounded-md border border-slate-200 bg-white px-2 text-xs"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">كل أنشطة الشركات</option>
            {COMPANY_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <select
            className="h-9 rounded-md border border-slate-200 bg-white px-2 text-xs"
            value={membersFilter}
            onChange={(e) => setMembersFilter(e.target.value as typeof membersFilter)}
          >
            <option value="all">كل أحجام الفرق</option>
            <option value="0">بدون موظفين</option>
            <option value="1-5">1-5 موظفين</option>
            <option value="6-20">6-20 موظف</option>
            <option value="21+">21+ موظف</option>
          </select>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          المعروض: <span className="font-semibold text-slate-700">{filteredCompanies.length}</span> من{" "}
          <span className="font-semibold text-slate-700">{companies.length}</span>
        </p>
      </div>

      <div className="mt-4 overflow-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-[1240px] w-full text-right text-sm">
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
            ) : filteredCompanies.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-center text-slate-500" colSpan={9}>
                  لا توجد نتائج مطابقة للفلاتر الحالية.
                </td>
              </tr>
            ) : (
              filteredCompanies.map((company) => (
                <tr key={company.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium text-slate-900">{company.name}</td>
                  <td className="px-3 py-2 text-xs text-slate-600">{company.slug}</td>
                  <td className="px-3 py-2">{company.subscription_plan}</td>
                  <td className="px-3 py-2">
                    <StatusBadge value={company.status} type="company" />
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <StatusBadge value={company.subscription_status ?? "active"} type="subscription" />
                  </td>
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
                        disabled={enterCompany.isPending || quickSubscriptionMutation.isPending}
                        onClick={() => enterCompany.mutate(company.id)}
                        className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
                      >
                        <LogIn className="h-3.5 w-3.5" />
                        تبديل للوضع التشغيلي
                      </button>
                      <button
                        type="button"
                        disabled={quickSubscriptionMutation.isPending}
                        onClick={() => quickSubscriptionMutation.mutate({ companyId: company.id, action: "renew" })}
                        className="inline-flex items-center gap-1 rounded border border-sky-200 bg-sky-50 px-2 py-1 text-xs text-sky-900 hover:bg-sky-100 disabled:opacity-50"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        تجديد
                      </button>
                      <button
                        type="button"
                        disabled={quickSubscriptionMutation.isPending}
                        onClick={() => quickSubscriptionMutation.mutate({ companyId: company.id, action: "suspend" })}
                        className="inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                      >
                        <PauseCircle className="h-3.5 w-3.5" />
                        تعليق
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent className="overflow-y-auto" dir="rtl">
          <SheetHeader>
            <SheetTitle>شركة جديدة</SheetTitle>
            <SheetDescription>
              بعد الإنشاء، اربط كل مستخدم بالشركة من «إدارة الفريق والصلاحيات» بعد الدخول إلى سياق تلك الشركة (زر «تبديل للوضع التشغيلي»). النظام يعرف انتماء المستخدم عبر عضوية نشطة في الشركة وليس بالاسم فقط.
            </SheetDescription>
          </SheetHeader>
          <form
            className="mt-6 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              createMutation.mutate();
            }}
          >
            <label className="block text-xs font-medium text-slate-700">
              الاسم
              <input
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                value={createForm.name}
                onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                required
                placeholder="اسم المنشأة"
              />
            </label>
            <label className="block text-xs font-medium text-slate-700">
              Slug (اختياري، إنجليزي)
              <input
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                value={createForm.slug}
                onChange={(e) => setCreateForm((f) => ({ ...f, slug: e.target.value }))}
                placeholder="يُولَّد تلقائياً إن وُجد تعارض أو اسم عربي"
              />
            </label>
            <label className="block text-xs font-medium text-slate-700">
              الباقة
              <select
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                value={createForm.subscription_plan}
                onChange={(e) => setCreateForm((f) => ({ ...f, subscription_plan: e.target.value }))}
              >
                {(plansQuery.data ?? []).length > 0 ? (
                  (plansQuery.data ?? []).map((p) => (
                    <option key={p.plan_key} value={p.plan_key}>
                      {p.display_name} ({p.plan_key})
                    </option>
                  ))
                ) : (
                  <option value="basic">basic</option>
                )}
              </select>
            </label>
            <label className="block text-xs font-medium text-slate-700">
              حالة الشركة
              <select
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                value={createForm.status}
                onChange={(e) => setCreateForm((f) => ({ ...f, status: e.target.value }))}
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
                value={createForm.subscription_status}
                onChange={(e) => setCreateForm((f) => ({ ...f, subscription_status: e.target.value }))}
              >
                {SUB_STATUSES.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-slate-700">
              بريد الفوترة (اختياري)
              <input
                type="email"
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                value={createForm.billing_email}
                onChange={(e) => setCreateForm((f) => ({ ...f, billing_email: e.target.value }))}
                placeholder="billing@company.com"
              />
            </label>
            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {createMutation.isPending ? "جاري الإنشاء…" : "إنشاء"}
              </button>
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm"
                onClick={() => setCreateOpen(false)}
              >
                إلغاء
              </button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

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

function StatusBadge({ value, type }: { value: string; type: "company" | "subscription" }) {
  const normalized = (value || "").toLowerCase();
  let label = value;
  let cls = "bg-slate-100 text-slate-700";

  if (type === "company") {
    if (normalized === "active") {
      label = "Active";
      cls = "bg-emerald-100 text-emerald-800";
    } else if (normalized === "suspended") {
      label = "Suspended";
      cls = "bg-amber-100 text-amber-800";
    } else if (normalized === "cancelled") {
      label = "Cancelled";
      cls = "bg-rose-100 text-rose-800";
    } else if (normalized === "trial") {
      label = "Trial";
      cls = "bg-sky-100 text-sky-800";
    }
  } else {
    if (normalized === "active") {
      label = "Active";
      cls = "bg-emerald-100 text-emerald-800";
    } else if (normalized === "expired") {
      label = "Expired";
      cls = "bg-rose-100 text-rose-800";
    } else if (normalized === "past_due") {
      label = "Past Due";
      cls = "bg-amber-100 text-amber-800";
    } else if (normalized === "cancelled") {
      label = "Cancelled";
      cls = "bg-slate-200 text-slate-800";
    } else if (normalized === "trial") {
      label = "Trial";
      cls = "bg-sky-100 text-sky-800";
    }
  }

  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{label}</span>;
}
