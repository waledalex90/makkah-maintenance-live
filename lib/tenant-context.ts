import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { recordSecurityEvent } from "@/lib/security-events";
import { isProtectedSuperAdminEmail } from "@/lib/protected-super-admin";
import { PLATFORM_CONTEXT_COOKIE } from "@/lib/platform-context";

export type TenantContext =
  | {
      ok: true;
      userId: string;
      activeCompanyId: string | null;
      isPlatformAdmin: boolean;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

export async function getTenantContext(): Promise<TenantContext> {
  const supabase = await createSupabaseServerClient();
  const cookieStore = await cookies();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    await recordSecurityEvent({
      event_type: "auth_unauthorized",
      status_code: 401,
      message: "Missing authenticated user while resolving tenant context.",
      metadata: { source: "tenant-context" },
    });
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("active_company_id, company_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile) {
    await recordSecurityEvent({
      event_type: "tenant_guard_reject",
      status_code: 403,
      message: "Missing profile row for authenticated user.",
      actor_user_id: user.id,
      actor_email: user.email ?? null,
      metadata: { source: "tenant-context", profileError: profileError?.message ?? null },
    });
    return { ok: false, status: 403, error: "missing_profile" };
  }

  const { data: platformAdmin, error: platformError } = await supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (platformError && !isProtectedSuperAdminEmail(user.email)) {
    await recordSecurityEvent({
      event_type: "tenant_guard_reject",
      status_code: 400,
      message: "Failed reading platform_admins table.",
      actor_user_id: user.id,
      actor_email: user.email ?? null,
      actor_company_id: profile.active_company_id ?? profile.company_id ?? null,
      metadata: { source: "tenant-context", platformError: platformError.message },
    });
    return { ok: false, status: 400, error: platformError.message };
  }

  const isPlatformAdmin = Boolean(platformAdmin?.user_id) || isProtectedSuperAdminEmail(user.email);
  const tempPlatformCompanyId = cookieStore.get(PLATFORM_CONTEXT_COOKIE)?.value?.trim() || null;
  const activeCompanyId = isPlatformAdmin
    ? (tempPlatformCompanyId || null)
    : (profile.active_company_id ?? profile.company_id ?? null);

  if (!isPlatformAdmin && !activeCompanyId) {
    await recordSecurityEvent({
      event_type: "tenant_guard_reject",
      status_code: 403,
      message: "Missing active_company_id for non-platform-admin actor.",
      actor_user_id: user.id,
      actor_email: user.email ?? null,
      metadata: { source: "tenant-context" },
    });
    return { ok: false, status: 403, error: "missing_active_company" };
  }

  return {
    ok: true,
    userId: user.id,
    activeCompanyId,
    isPlatformAdmin,
  };
}

