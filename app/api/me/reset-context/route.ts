import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isProtectedSuperAdminEmail } from "@/lib/protected-super-admin";
import { PLATFORM_CONTEXT_COOKIE, PLATFORM_GOD_MODE_COOKIE } from "@/lib/platform-context";

export async function POST() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const { data: platformAdminRow } = await admin
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();
  const isPlatformAdmin = Boolean(platformAdminRow?.user_id) || isProtectedSuperAdminEmail(user.email);
  if (!isPlatformAdmin) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  await admin.from("profiles").update({ active_company_id: null }).eq("id", user.id);

  const response = NextResponse.json({ ok: true, active_company_id: null });
  response.cookies.set(PLATFORM_CONTEXT_COOKIE, "", {
    path: "/",
    maxAge: 0,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
  response.cookies.set(PLATFORM_GOD_MODE_COOKIE, "", {
    path: "/",
    maxAge: 0,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}
