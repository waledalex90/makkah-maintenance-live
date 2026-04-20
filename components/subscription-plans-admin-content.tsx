"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";

type PlanRow = {
  plan_key: string;
  display_name: string;
  price_monthly: number;
  max_technicians: number | null;
  max_tickets_per_month: number | null;
  max_zones: number | null;
  is_active: boolean;
  features: Record<string, unknown> | null;
  limits: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
};

function stringifyJson(obj: Record<string, unknown> | null | undefined): string {
  try {
    return JSON.stringify(obj ?? {}, null, 2);
  } catch {
    return "{}";
  }
}

function parseJsonField(raw: string, label: string): Record<string, unknown> | null {
  const t = raw.trim();
  if (!t) return {};
  try {
    const v = JSON.parse(t) as unknown;
    if (typeof v !== "object" || v === null || Array.isArray(v)) {
      toast.error(`${label}: يجب أن يكون كائناً JSON.`);
      return null;
    }
    return v as Record<string, unknown>;
  } catch {
    toast.error(`${label}: JSON غير صالح.`);
    return null;
  }
}

export function SubscriptionPlansAdminContent() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["platform-subscription-plans-manage"],
    queryFn: async () => {
      const res = await fetch("/api/platform/subscription-plans?manage=1", { cache: "no-store" });
      const json = (await res.json()) as { plans?: PlanRow[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? "تعذر تحميل الباقات");
      return json.plans ?? [];
    },
    refetchInterval: 30_000,
  });

  const rows = query.data ?? [];
  const sorted = useMemo(() => [...rows].sort((a, b) => a.plan_key.localeCompare(b.plan_key)), [rows]);

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<PlanRow | null>(null);

  const [createForm, setCreateForm] = useState({
    plan_key: "",
    display_name: "",
    price_monthly: "0",
    max_technicians: "",
    max_tickets_per_month: "",
    max_zones: "",
    is_active: true,
    featuresJson: "{}",
    limitsJson: "{}",
  });

  const [editForm, setEditForm] = useState({
    display_name: "",
    price_monthly: "0",
    max_technicians: "",
    max_tickets_per_month: "",
    max_zones: "",
    is_active: true,
    featuresJson: "{}",
    limitsJson: "{}",
  });

  const openEdit = (p: PlanRow) => {
    setEditing(p);
    setEditForm({
      display_name: p.display_name,
      price_monthly: String(p.price_monthly ?? 0),
      max_technicians: p.max_technicians === null || p.max_technicians === undefined ? "" : String(p.max_technicians),
      max_tickets_per_month:
        p.max_tickets_per_month === null || p.max_tickets_per_month === undefined ? "" : String(p.max_tickets_per_month),
      max_zones: p.max_zones === null || p.max_zones === undefined ? "" : String(p.max_zones),
      is_active: p.is_active,
      featuresJson: stringifyJson(p.features as Record<string, unknown> | null),
      limitsJson: stringifyJson(p.limits as Record<string, unknown> | null),
    });
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const fk = createForm.plan_key.trim().toLowerCase();
      const features = parseJsonField(createForm.featuresJson, "الميزات");
      const limits = parseJsonField(createForm.limitsJson, "الحدود الإضافية");
      if (features === null || limits === null) throw new Error("invalid json");

      const payload = {
        plan_key: fk,
        display_name: createForm.display_name.trim(),
        price_monthly: Number(createForm.price_monthly) || 0,
        max_technicians: createForm.max_technicians.trim() === "" ? null : Number(createForm.max_technicians),
        max_tickets_per_month:
          createForm.max_tickets_per_month.trim() === "" ? null : Number(createForm.max_tickets_per_month),
        max_zones: createForm.max_zones.trim() === "" ? null : Number(createForm.max_zones),
        is_active: createForm.is_active,
        features,
        limits,
      };
      const res = await fetch("/api/platform/subscription-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error ?? "فشل الإنشاء");
    },
    onSuccess: () => {
      toast.success("تم إنشاء الباقة.");
      setCreateOpen(false);
      setCreateForm({
        plan_key: "",
        display_name: "",
        price_monthly: "0",
        max_technicians: "",
        max_tickets_per_month: "",
        max_zones: "",
        is_active: true,
        featuresJson: "{}",
        limitsJson: "{}",
      });
      void queryClient.invalidateQueries({ queryKey: ["platform-subscription-plans-manage"] });
      void queryClient.invalidateQueries({ queryKey: ["platform-subscription-plans"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      const features = parseJsonField(editForm.featuresJson, "الميزات");
      const limits = parseJsonField(editForm.limitsJson, "الحدود الإضافية");
      if (features === null || limits === null) throw new Error("invalid json");

      const payload = {
        display_name: editForm.display_name.trim(),
        price_monthly: Number(editForm.price_monthly) || 0,
        max_technicians: editForm.max_technicians.trim() === "" ? null : Number(editForm.max_technicians),
        max_tickets_per_month:
          editForm.max_tickets_per_month.trim() === "" ? null : Number(editForm.max_tickets_per_month),
        max_zones: editForm.max_zones.trim() === "" ? null : Number(editForm.max_zones),
        is_active: editForm.is_active,
        features,
        limits,
      };
      const res = await fetch(`/api/platform/subscription-plans/${encodeURIComponent(editing.plan_key)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error ?? "فشل الحفظ");
    },
    onSuccess: () => {
      toast.success("تم حفظ الباقة.");
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: ["platform-subscription-plans-manage"] });
      void queryClient.invalidateQueries({ queryKey: ["platform-subscription-plans"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (planKey: string) => {
      const res = await fetch(`/api/platform/subscription-plans/${encodeURIComponent(planKey)}`, { method: "DELETE" });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        if (json.error === "cannot_delete_plan_in_use") {
          throw new Error("لا يمكن حذف باقة مرتبطة بشركة.");
        }
        throw new Error(json.error ?? "فشل الحذف");
      }
    },
    onSuccess: () => {
      toast.success("تم حذف الباقة.");
      void queryClient.invalidateQueries({ queryKey: ["platform-subscription-plans-manage"] });
      void queryClient.invalidateQueries({ queryKey: ["platform-subscription-plans"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="rounded-xl border border-slate-200 bg-slate-100 p-4" dir="rtl" lang="ar">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-900">
            <CreditCard className="h-6 w-6" aria-hidden />
            إدارة الباقات
          </h1>
          <p className="mt-1 text-xs text-slate-600">
            تعريف الباقات والحدود والميزات من قاعدة البيانات دون تثبيتها في الكود. استخدم JSON للميزات والحدود الإضافية.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex h-9 items-center gap-1 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 hover:bg-slate-50"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="h-4 w-4" />
          باقة جديدة
        </button>
      </div>

      <div className="mt-4 overflow-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-[960px] w-full text-right text-sm">
          <thead className="bg-slate-50 text-slate-700">
            <tr>
              <th className="px-3 py-2">المفتاح</th>
              <th className="px-3 py-2">الاسم</th>
              <th className="px-3 py-2">السعر الشهري</th>
              <th className="px-3 py-2">فنيين / تذاكر / مناطق</th>
              <th className="px-3 py-2">الحالة</th>
              <th className="px-3 py-2 w-40">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {query.isLoading ? (
              <tr>
                <td className="px-3 py-6 text-center text-slate-500" colSpan={6}>
                  جاري التحميل...
                </td>
              </tr>
            ) : sorted.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-center text-slate-500" colSpan={6}>
                  لا توجد باقات. أنشئ أول باقة أو طبّق الهجرات ثم أعد التحميل.
                </td>
              </tr>
            ) : (
              sorted.map((p) => (
                <tr key={p.plan_key} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-mono text-xs">{p.plan_key}</td>
                  <td className="px-3 py-2">{p.display_name}</td>
                  <td className="px-3 py-2">{Number(p.price_monthly ?? 0).toFixed(2)}</td>
                  <td className="px-3 py-2 text-xs text-slate-600">
                    {p.max_technicians ?? "—"} / {p.max_tickets_per_month ?? "—"} / {p.max_zones ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    {p.is_active ? (
                      <Badge className="bg-emerald-100 text-emerald-800">نشطة</Badge>
                    ) : (
                      <Badge variant="muted">معطّلة</Badge>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1 justify-end">
                      <button
                        type="button"
                        className="inline-flex h-8 items-center gap-1 rounded border border-slate-200 bg-white px-2 text-xs hover:bg-slate-50"
                        onClick={() => openEdit(p)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        تعديل
                      </button>
                      <button
                        type="button"
                        className="inline-flex h-8 items-center gap-1 rounded border border-red-200 bg-red-50 px-2 text-xs text-red-800 hover:bg-red-100"
                        onClick={() => {
                          if (!confirm(`حذف الباقة «${p.display_name}» (${p.plan_key})؟`)) return;
                          deleteMutation.mutate(p.plan_key);
                        }}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        حذف
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
        <SheetContent className="overflow-y-auto sm:max-w-lg" dir="rtl">
          <SheetHeader>
            <SheetTitle>باقة جديدة</SheetTitle>
            <SheetDescription>المفتاح باللاتينية (صغير)؛ لا يُغيّر بعد الإنشاء.</SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-3 text-sm">
            <label className="block space-y-1">
              <span className="text-slate-700">plan_key</span>
              <input
                className="w-full rounded border border-slate-200 px-2 py-1.5 font-mono text-xs"
                value={createForm.plan_key}
                onChange={(e) => setCreateForm((f) => ({ ...f, plan_key: e.target.value }))}
                placeholder="starter"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-slate-700">الاسم المعروض</span>
              <input
                className="w-full rounded border border-slate-200 px-2 py-1.5"
                value={createForm.display_name}
                onChange={(e) => setCreateForm((f) => ({ ...f, display_name: e.target.value }))}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-slate-700">السعر الشهري (ر.س)</span>
              <input
                type="number"
                step="0.01"
                className="w-full rounded border border-slate-200 px-2 py-1.5"
                value={createForm.price_monthly}
                onChange={(e) => setCreateForm((f) => ({ ...f, price_monthly: e.target.value }))}
              />
            </label>
            <div className="grid grid-cols-3 gap-2">
              <label className="block space-y-1">
                <span className="text-xs text-slate-600">حد الفنيين</span>
                <input
                  className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs"
                  value={createForm.max_technicians}
                  onChange={(e) => setCreateForm((f) => ({ ...f, max_technicians: e.target.value }))}
                  placeholder="فارغ = لا حد"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-slate-600">تذاكر/شهر</span>
                <input
                  className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs"
                  value={createForm.max_tickets_per_month}
                  onChange={(e) => setCreateForm((f) => ({ ...f, max_tickets_per_month: e.target.value }))}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-slate-600">مناطق</span>
                <input
                  className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs"
                  value={createForm.max_zones}
                  onChange={(e) => setCreateForm((f) => ({ ...f, max_zones: e.target.value }))}
                />
              </label>
            </div>
            <label className="flex items-center gap-2 text-slate-700">
              <input
                type="checkbox"
                checked={createForm.is_active}
                onChange={(e) => setCreateForm((f) => ({ ...f, is_active: e.target.checked }))}
              />
              باقة نشطة (تظهر لاختيار الشركات)
            </label>
            <label className="block space-y-1">
              <span className="text-slate-700">ميزات (JSON) — مفاتيح منطقية أو توسعة مستقبلية</span>
              <textarea
                className="min-h-[100px] w-full rounded border border-slate-200 px-2 py-1.5 font-mono text-xs"
                value={createForm.featuresJson}
                onChange={(e) => setCreateForm((f) => ({ ...f, featuresJson: e.target.value }))}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-slate-700">حدود إضافية (JSON) — مثلاً max_users</span>
              <textarea
                className="min-h-[80px] w-full rounded border border-slate-200 px-2 py-1.5 font-mono text-xs"
                value={createForm.limitsJson}
                onChange={(e) => setCreateForm((f) => ({ ...f, limitsJson: e.target.value }))}
              />
            </label>
            <button
              type="button"
              className="w-full rounded-md bg-slate-900 py-2 text-sm font-medium text-white hover:bg-slate-800"
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? "جاري الحفظ..." : "إنشاء"}
            </button>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={Boolean(editing)} onOpenChange={(o) => !o && setEditing(null)}>
        <SheetContent className="overflow-y-auto sm:max-w-lg" dir="rtl">
          <SheetHeader>
            <SheetTitle>تعديل باقة</SheetTitle>
            <SheetDescription className="font-mono text-xs">{editing?.plan_key}</SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-3 text-sm">
            <label className="block space-y-1">
              <span className="text-slate-700">الاسم المعروض</span>
              <input
                className="w-full rounded border border-slate-200 px-2 py-1.5"
                value={editForm.display_name}
                onChange={(e) => setEditForm((f) => ({ ...f, display_name: e.target.value }))}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-slate-700">السعر الشهري</span>
              <input
                type="number"
                step="0.01"
                className="w-full rounded border border-slate-200 px-2 py-1.5"
                value={editForm.price_monthly}
                onChange={(e) => setEditForm((f) => ({ ...f, price_monthly: e.target.value }))}
              />
            </label>
            <div className="grid grid-cols-3 gap-2">
              <label className="block space-y-1">
                <span className="text-xs text-slate-600">حد الفنيين</span>
                <input
                  className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs"
                  value={editForm.max_technicians}
                  onChange={(e) => setEditForm((f) => ({ ...f, max_technicians: e.target.value }))}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-slate-600">تذاكر/شهر</span>
                <input
                  className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs"
                  value={editForm.max_tickets_per_month}
                  onChange={(e) => setEditForm((f) => ({ ...f, max_tickets_per_month: e.target.value }))}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-slate-600">مناطق</span>
                <input
                  className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs"
                  value={editForm.max_zones}
                  onChange={(e) => setEditForm((f) => ({ ...f, max_zones: e.target.value }))}
                />
              </label>
            </div>
            <label className="flex items-center gap-2 text-slate-700">
              <input
                type="checkbox"
                checked={editForm.is_active}
                onChange={(e) => setEditForm((f) => ({ ...f, is_active: e.target.checked }))}
              />
              باقة نشطة
            </label>
            <label className="block space-y-1">
              <span className="text-slate-700">ميزات (JSON)</span>
              <textarea
                className="min-h-[100px] w-full rounded border border-slate-200 px-2 py-1.5 font-mono text-xs"
                value={editForm.featuresJson}
                onChange={(e) => setEditForm((f) => ({ ...f, featuresJson: e.target.value }))}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-slate-700">حدود إضافية (JSON)</span>
              <textarea
                className="min-h-[80px] w-full rounded border border-slate-200 px-2 py-1.5 font-mono text-xs"
                value={editForm.limitsJson}
                onChange={(e) => setEditForm((f) => ({ ...f, limitsJson: e.target.value }))}
              />
            </label>
            <button
              type="button"
              className="w-full rounded-md bg-slate-900 py-2 text-sm font-medium text-white hover:bg-slate-800"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? "جاري الحفظ..." : "حفظ"}
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </section>
  );
}
