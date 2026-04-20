"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  CalendarClock,
  Layers,
  LogIn,
  Pencil,
  PauseCircle,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";

type CompanyRow = {
  id: string;
  name: string;
  slug: string;
  subscription_plan: string;
  status: string;
  subscription_status?: string;
  subscription_expires_at?: string | null;
  billing_email?: string | null;
  branding_primary_hex?: string | null;
  branding_accent_hex?: string | null;
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
    branding_primary_hex: "",
    branding_accent_hex: "",
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
      branding_primary_hex: editing.branding_primary_hex ?? "",
      branding_accent_hex: editing.branding_accent_hex ?? "",
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
        branding_primary_hex: form.branding_primary_hex.trim() || null,
        branding_accent_hex: form.branding_accent_hex.trim() || null,
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
  const planDisplayMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of plansQuery.data ?? []) m.set(p.plan_key, p.display_name);
    return m;
  }, [plansQuery.data]);

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
    <section className="min-h-[calc(100vh-6rem)] bg-gradient-to-b from-slate-50 to-slate-100/80 pb-12 pt-2" dir="rtl" lang="ar">
      {/* رأس الصفحة */}
      <div className="mx-auto max-w-[1600px] px-4 sm:px-6">
        <div className="flex flex-col gap-4 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-slate-500">
              <Building2 className="h-5 w-5 text-slate-400" aria-hidden />
              <span className="text-xs font-medium uppercase tracking-wide">لوحة إدارية</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">متجر الشركات</h1>
            <p className="max-w-xl text-sm leading-relaxed text-slate-600">
              استعرض المستأجرين، صِفْ الباقات والاشتراكات، وانتقل إلى سياق أي شركة للتشغيل — واجهة نظيفة وبطاقات
              واضحة.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-slate-900/15 transition hover:bg-slate-800"
            >
              <Plus className="h-4 w-4" />
              إضافة شركة
            </button>
            <a
              href="/dashboard/admin/platform"
              className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              العودة للوحة المنصة
            </a>
          </div>
        </div>

        {/* شريط أدوات — فلاتر مضغوطة */}
        <div className="sticky top-2 z-20 rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-3 shadow-sm shadow-slate-200/50 backdrop-blur-md sm:px-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
            <div className="relative min-w-0 flex-1 lg:max-w-md">
              <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/50 pr-10 pl-3 text-sm outline-none ring-slate-300 transition placeholder:text-slate-400 focus:border-slate-300 focus:bg-white focus:ring-2"
                placeholder="بحث بالاسم، الـ slug، أو الباقة…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="بحث في الشركات"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:gap-2.5">
              <span className="hidden items-center gap-1.5 text-xs font-medium text-slate-500 sm:inline-flex">
                <SlidersHorizontal className="h-3.5 w-3.5" />
                تصفية
              </span>
              <select
                className="h-9 min-w-[130px] flex-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-800 shadow-sm sm:flex-none sm:min-w-[140px]"
                value={subscriptionFilter}
                onChange={(e) => setSubscriptionFilter(e.target.value)}
                aria-label="حالة الاشتراك"
              >
                <option value="all">كل الاشتراكات</option>
                {SUB_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
              <select
                className="h-9 min-w-[130px] flex-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-800 shadow-sm sm:flex-none sm:min-w-[140px]"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                aria-label="نشاط الشركة"
              >
                <option value="all">كل الشركات</option>
                {COMPANY_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
              <select
                className="h-9 min-w-[120px] flex-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-800 shadow-sm sm:flex-none"
                value={membersFilter}
                onChange={(e) => setMembersFilter(e.target.value as typeof membersFilter)}
                aria-label="حجم الفريق"
              >
                <option value="all">كل الأحجام</option>
                <option value="0">بدون موظفين</option>
                <option value="1-5">1–5</option>
                <option value="6-20">6–20</option>
                <option value="21+">21+</option>
              </select>
            </div>
          </div>
          <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
            المعروض{" "}
            <span className="font-semibold text-slate-800">{filteredCompanies.length}</span> من{" "}
            <span className="font-semibold text-slate-800">{companies.length}</span> شركة
          </p>
        </div>

        {/* شبكة الكروت */}
        {query.isLoading ? (
          <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="h-64 animate-pulse rounded-2xl border border-slate-200/80 bg-white shadow-md"
              />
            ))}
          </div>
        ) : filteredCompanies.length === 0 ? (
          <div className="mx-auto mt-16 max-w-md rounded-2xl border border-dashed border-slate-200 bg-white/80 px-6 py-14 text-center shadow-sm">
            <Layers className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-4 text-sm font-medium text-slate-700">لا توجد شركات مطابقة</p>
            <p className="mt-1 text-xs text-slate-500">جرّب تغيير البحث أو الفلاتر أعلاه.</p>
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredCompanies.map((company) => {
              const planName = planDisplayMap.get(company.subscription_plan) ?? company.subscription_plan;
              return (
                <Card
                  key={company.id}
                  className="flex flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-md shadow-slate-200/40 transition hover:shadow-lg hover:shadow-slate-300/50"
                >
                  <CardHeader className="space-y-3 p-5 pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="line-clamp-2 text-lg font-bold leading-snug text-slate-900">{company.name}</h2>
                      <CompanyStatusBadge value={company.status} />
                    </div>
                    <p className="font-mono text-xs text-slate-500" dir="ltr">
                      /{company.slug}
                    </p>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col gap-3 px-5 pb-2 pt-0 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-slate-500">الاشتراك</span>
                      <SubscriptionStatusBadge value={company.subscription_status ?? "active"} />
                    </div>
                    <div className="flex items-start gap-3 rounded-xl bg-slate-50/80 px-3 py-2.5">
                      <Layers className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                      <div>
                        <p className="text-[11px] font-medium text-slate-500">الباقة</p>
                        <p className="font-semibold text-slate-800">{planName}</p>
                        <p className="text-[10px] text-slate-400">{company.subscription_plan}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-slate-700">
                      <Users className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                      <span className="text-sm">
                        <span className="font-bold tabular-nums text-slate-900">{company.active_members}</span>
                        <span className="mr-1 text-xs text-slate-500">عضو نشط</span>
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-[11px] text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        <CalendarClock className="h-3.5 w-3.5" />
                        ينتهي:{" "}
                        {company.subscription_expires_at
                          ? new Date(company.subscription_expires_at).toLocaleDateString("ar-SA")
                          : "—"}
                      </span>
                    </div>
                  </CardContent>
                  <CardFooter className="mt-auto flex flex-col gap-2 border-t border-slate-100 bg-slate-50/30 p-4">
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <button
                        type="button"
                        disabled={enterCompany.isPending || quickSubscriptionMutation.isPending}
                        onClick={() => enterCompany.mutate(company.id)}
                        className="inline-flex min-h-[2.75rem] flex-col items-center justify-center gap-0.5 rounded-xl border border-emerald-200/90 bg-emerald-50 px-1 py-2 text-[11px] font-semibold text-emerald-900 transition hover:bg-emerald-100 disabled:opacity-50 sm:text-xs"
                        title="تبديل للوضع التشغيلي"
                      >
                        <LogIn className="h-4 w-4 shrink-0" />
                        <span className="leading-tight">تشغيل</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditing(company)}
                        className="inline-flex min-h-[2.75rem] flex-col items-center justify-center gap-0.5 rounded-xl border border-slate-200 bg-white px-1 py-2 text-[11px] font-semibold text-slate-800 transition hover:bg-slate-50 sm:text-xs"
                        title="تعديل"
                      >
                        <Pencil className="h-4 w-4 shrink-0" />
                        <span className="leading-tight">تعديل</span>
                      </button>
                      <button
                        type="button"
                        disabled={quickSubscriptionMutation.isPending}
                        onClick={() => quickSubscriptionMutation.mutate({ companyId: company.id, action: "renew" })}
                        className="inline-flex min-h-[2.75rem] flex-col items-center justify-center gap-0.5 rounded-xl border border-sky-200 bg-sky-50 px-1 py-2 text-[11px] font-semibold text-sky-900 transition hover:bg-sky-100 disabled:opacity-50 sm:text-xs"
                        title="تجديد الاشتراك"
                      >
                        <RotateCcw className="h-4 w-4 shrink-0" />
                        <span className="leading-tight">تجديد</span>
                      </button>
                      <button
                        type="button"
                        disabled={quickSubscriptionMutation.isPending}
                        onClick={() => quickSubscriptionMutation.mutate({ companyId: company.id, action: "suspend" })}
                        className="inline-flex min-h-[2.75rem] flex-col items-center justify-center gap-0.5 rounded-xl border border-amber-200 bg-amber-50 px-1 py-2 text-[11px] font-semibold text-amber-950 transition hover:bg-amber-100 disabled:opacity-50 sm:text-xs"
                        title="تعليق"
                      >
                        <PauseCircle className="h-4 w-4 shrink-0" />
                        <span className="leading-tight">تعليق</span>
                      </button>
                    </div>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        )}
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
            <SheetDescription>تحديث الباقة وحالة الحساب وألوان واجهة UP FLOW للشركة.</SheetDescription>
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
              <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3">
                <p className="mb-2 text-xs font-semibold text-slate-800">ألوان الواجهة (UP FLOW)</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-xs font-medium text-slate-700">
                    لون أساسي (مثال كحلي)
                    <input
                      type="text"
                      className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 font-mono text-sm"
                      value={form.branding_primary_hex}
                      onChange={(e) => setForm((f) => ({ ...f, branding_primary_hex: e.target.value }))}
                      placeholder="#1e3a5f"
                    />
                  </label>
                  <label className="block text-xs font-medium text-slate-700">
                    لون تنبيه (برتقالي)
                    <input
                      type="text"
                      className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 font-mono text-sm"
                      value={form.branding_accent_hex}
                      onChange={(e) => setForm((f) => ({ ...f, branding_accent_hex: e.target.value }))}
                      placeholder="#ea580c"
                    />
                  </label>
                </div>
                <p className="mt-2 text-[11px] text-slate-500">اترك الحقل فارغاً لاستخدام القيم الافتراضية للمنصة.</p>
              </div>
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

function CompanyStatusBadge({ value }: { value: string }) {
  const normalized = (value || "").toLowerCase();
  const entry = COMPANY_STATUSES.find((s) => s.value === normalized);
  const label = entry?.label ?? value;
  if (normalized === "active") return <Badge variant="green">{label}</Badge>;
  if (normalized === "suspended") return <Badge variant="yellow">{label}</Badge>;
  if (normalized === "cancelled") return <Badge variant="red">{label}</Badge>;
  if (normalized === "trial") return <Badge className="border-sky-200 bg-sky-100 text-sky-900">{label}</Badge>;
  return <Badge variant="muted">{label}</Badge>;
}

function SubscriptionStatusBadge({ value }: { value: string }) {
  const normalized = (value || "").toLowerCase();
  const entry = SUB_STATUSES.find((s) => s.value === normalized);
  const label = entry?.label ?? value;
  if (normalized === "active") return <Badge variant="green">{label}</Badge>;
  if (normalized === "expired") return <Badge variant="red">{label}</Badge>;
  if (normalized === "past_due") return <Badge variant="yellow">{label}</Badge>;
  if (normalized === "cancelled") return <Badge variant="muted">{label}</Badge>;
  if (normalized === "trial") return <Badge className="border-sky-200 bg-sky-100 text-sky-900">{label}</Badge>;
  return <Badge variant="muted">{label}</Badge>;
}
