import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

export type CompanyBillingSummary = {
  plan_key: string;
  plan_name: string;
  price_monthly: number;
  limits: {
    technicians: number | null;
    tickets_per_month: number | null;
    zones: number | null;
  };
  usage: {
    technicians: number;
    tickets_this_month: number;
    zones: number;
  };
};

export async function getCompanyBillingSummary(admin: AdminClient, companyId: string): Promise<CompanyBillingSummary | null> {
  const { data: company, error: companyError } = await admin
    .from("companies")
    .select("id, subscription_plan, subscription_plans:subscription_plan(plan_key, display_name, price_monthly, max_technicians, max_tickets_per_month, max_zones)")
    .eq("id", companyId)
    .maybeSingle();
  if (companyError || !company) return null;

  const plan = Array.isArray(company.subscription_plans) ? company.subscription_plans[0] : company.subscription_plans;
  if (!plan) return null;

  const [techRows, zoneRows, ticketRows] = await Promise.all([
    admin.from("profiles").select("id", { count: "exact", head: true }).eq("company_id", companyId).in("role", ["technician", "engineer", "supervisor"]),
    admin.from("zones").select("id", { count: "exact", head: true }).eq("company_id", companyId),
    admin
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .gte("created_at", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString())
      .lt("created_at", new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString()),
  ]);

  return {
    plan_key: String(plan.plan_key),
    plan_name: String(plan.display_name ?? plan.plan_key),
    price_monthly: Number(plan.price_monthly ?? 0),
    limits: {
      technicians: (plan.max_technicians as number | null) ?? null,
      tickets_per_month: (plan.max_tickets_per_month as number | null) ?? null,
      zones: (plan.max_zones as number | null) ?? null,
    },
    usage: {
      technicians: techRows.count ?? 0,
      tickets_this_month: ticketRows.count ?? 0,
      zones: zoneRows.count ?? 0,
    },
  };
}

export async function assertWithinTechnicianLimit(admin: AdminClient, companyId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const summary = await getCompanyBillingSummary(admin, companyId);
  if (!summary) return { ok: false, message: "تعذر قراءة بيانات الباقة للشركة." };
  if (summary.limits.technicians === null) return { ok: true };
  if (summary.usage.technicians >= summary.limits.technicians) {
    return {
      ok: false,
      message: `تم تجاوز حد الفنيين في الباقة الحالية (${summary.usage.technicians}/${summary.limits.technicians}).`,
    };
  }
  return { ok: true };
}

