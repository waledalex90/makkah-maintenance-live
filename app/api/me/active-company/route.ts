import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTenantContext } from "@/lib/tenant-context";

type ActiveCompanyPayload = {
  company_id?: string | null;
};

export async function PATCH(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as ActiveCompanyPayload;
  const raw = body.company_id;

  const admin = createSupabaseAdminClient();

  if (raw === null || raw === "") {
    const tenant = await getTenantContext();
    if (!tenant.ok) {
      return NextResponse.json({ ok: false, error: tenant.error }, { status: tenant.status });
    }
    if (!tenant.isPlatformAdmin) {
      return NextResponse.json({ ok: false, error: "company_not_allowed" }, { status: 403 });
    }
    const { error: updateError } = await admin.from("profiles").update({ active_company_id: null }).eq("id", user.id);
    if (updateError) {
      return NextResponse.json({ ok: false, error: updateError.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true, active_company_id: null });
  }

  const companyId = typeof raw === "string" ? raw.trim() : "";
  if (!companyId) {
    return NextResponse.json({ ok: false, error: "company_id is required" }, { status: 400 });
  }

  const { data: membership, error: membershipError } = await supabase
    .from("company_memberships")
    .select("company_id")
    .eq("user_id", user.id)
    .eq("company_id", companyId)
    .eq("status", "active")
    .maybeSingle();

  if (membershipError) {
    return NextResponse.json({ ok: false, error: membershipError.message }, { status: 400 });
  }

  if (membership) {
    const { error: updateError } = await supabase.from("profiles").update({ active_company_id: companyId }).eq("id", user.id);
    if (updateError) {
      return NextResponse.json({ ok: false, error: updateError.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true, active_company_id: companyId });
  }

  const tenant = await getTenantContext();
  if (!tenant.ok) {
    return NextResponse.json({ ok: false, error: tenant.error }, { status: tenant.status });
  }
  if (!tenant.isPlatformAdmin) {
    return NextResponse.json({ ok: false, error: "company_not_allowed" }, { status: 403 });
  }

  const { data: companyRow, error: companyErr } = await admin.from("companies").select("id").eq("id", companyId).maybeSingle();
  if (companyErr) {
    return NextResponse.json({ ok: false, error: companyErr.message }, { status: 400 });
  }
  if (!companyRow) {
    return NextResponse.json({ ok: false, error: "company_not_found" }, { status: 404 });
  }

  const { error: updateError } = await admin.from("profiles").update({ active_company_id: companyId }).eq("id", user.id);
  if (updateError) {
    return NextResponse.json({ ok: false, error: updateError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, active_company_id: companyId });
}
