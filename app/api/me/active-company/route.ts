import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type ActiveCompanyPayload = {
  company_id?: string;
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
  const companyId = body.company_id?.trim();
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
  if (!membership) {
    return NextResponse.json({ ok: false, error: "company_not_allowed" }, { status: 403 });
  }

  const { error: updateError } = await supabase.from("profiles").update({ active_company_id: companyId }).eq("id", user.id);
  if (updateError) {
    return NextResponse.json({ ok: false, error: updateError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, active_company_id: companyId });
}

