import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { recordSecurityEvent } from "@/lib/security-events";
import { isProtectedSuperAdminEmail } from "@/lib/protected-super-admin";
import { PLATFORM_CONTEXT_COOKIE } from "@/lib/platform-context";

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
  const { data: platformAdminRow } = await admin
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();
  const isPlatformAdmin = Boolean(platformAdminRow?.user_id) || isProtectedSuperAdminEmail(user.email);

  if (raw === null || raw === "") {
    if (!isPlatformAdmin) {
      return NextResponse.json({ ok: false, error: "company_not_allowed" }, { status: 403 });
    }
    const { error: updateError } = await admin.from("profiles").update({ active_company_id: null }).eq("id", user.id);
    if (updateError) {
      return NextResponse.json({ ok: false, error: updateError.message }, { status: 400 });
    }
    await recordSecurityEvent({
      event_type: "platform_mode_return",
      status_code: 200,
      message: "Platform admin returned to command center.",
      actor_user_id: user.id,
      actor_email: user.email ?? null,
      metadata: { source: "api/me/active-company" },
    });
    const response = NextResponse.json({ ok: true, active_company_id: null });
    response.cookies.set(PLATFORM_CONTEXT_COOKIE, "", {
      path: "/",
      maxAge: 0,
      sameSite: "lax",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
    });
    return response;
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

  if (membership && !isPlatformAdmin) {
    const { error: updateError } = await supabase.from("profiles").update({ active_company_id: companyId }).eq("id", user.id);
    if (updateError) {
      return NextResponse.json({ ok: false, error: updateError.message }, { status: 400 });
    }
    await recordSecurityEvent({
      event_type: "tenant_context_switch",
      status_code: 200,
      message: "User switched active tenant context via own membership.",
      actor_user_id: user.id,
      actor_email: user.email ?? null,
      actor_company_id: companyId,
      metadata: { source: "api/me/active-company", mode: "membership" },
    });
    return NextResponse.json({ ok: true, active_company_id: companyId });
  }

  const { data: companyRow, error: companyErr } = await admin.from("companies").select("id").eq("id", companyId).maybeSingle();
  if (companyErr) {
    return NextResponse.json({ ok: false, error: companyErr.message }, { status: 400 });
  }
  if (!companyRow) {
    return NextResponse.json({ ok: false, error: "company_not_found" }, { status: 404 });
  }
  if (!isPlatformAdmin) {
    return NextResponse.json({ ok: false, error: "company_not_allowed" }, { status: 403 });
  }

  const { error: updateError } = await admin.from("profiles").update({ active_company_id: null }).eq("id", user.id);
  if (updateError) {
    return NextResponse.json({ ok: false, error: updateError.message }, { status: 400 });
  }

  await recordSecurityEvent({
    event_type: "platform_god_mode_enter",
    status_code: 200,
    message: "Platform admin entered tenant context without direct membership.",
    actor_user_id: user.id,
    actor_email: user.email ?? null,
    actor_company_id: companyId,
    metadata: { source: "api/me/active-company", mode: membership ? "platform_membership_temp" : "platform_override_temp" },
  });

  const response = NextResponse.json({ ok: true, active_company_id: companyId });
  response.cookies.set(PLATFORM_CONTEXT_COOKIE, companyId, {
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}
