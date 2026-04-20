import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { canAccessDashboardPath } from "@/lib/permissions";
import { isProtectedSuperAdminEmail } from "@/lib/protected-super-admin";
import { PLATFORM_CONTEXT_COOKIE, PLATFORM_GOD_MODE_COOKIE } from "@/lib/platform-context";
import { isPlatformConsolePath } from "@/lib/platform-console-paths";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

type MiddlewareProfile = {
  role?: string | null;
  role_id?: string | null;
  permissions?: Record<string, unknown> | null;
  access_work_list?: boolean | null;
  active_company_id?: string | null;
  company_id?: string | null;
  roles?: { permissions?: Record<string, unknown> | null } | { permissions?: Record<string, unknown> | null }[] | null;
};

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isAuthPage = path === "/login";
  const isProtectedPath = path.startsWith("/dashboard") || path.startsWith("/tasks");
  const isPlatformConsole = isPlatformConsolePath(path);
  const hasGodModeFlag = request.cookies.get(PLATFORM_GOD_MODE_COOKIE)?.value === "1";

  let isPlatformAdminSession = false;
  if (user) {
    if (isProtectedSuperAdminEmail(user.email)) {
      isPlatformAdminSession = true;
    } else {
      const { data: platformAdminRow } = await supabase
        .from("platform_admins")
        .select("user_id")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle();
      isPlatformAdminSession = Boolean(platformAdminRow?.user_id);
    }
  }

  if (!user && isProtectedPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && isProtectedPath && !isPlatformAdminSession) {
    const { data: statusProfile } = await supabase
      .from("profiles")
      .select("active_company_id, company_id")
      .eq("id", user.id)
      .maybeSingle();
    const activeCompanyId = statusProfile?.active_company_id ?? statusProfile?.company_id ?? null;
    if (activeCompanyId) {
      const { data: companyStatusRow } = await supabase
        .from("companies")
        .select("status")
        .eq("id", activeCompanyId)
        .maybeSingle();
      if (companyStatusRow?.status === "suspended") {
        const suspendedUrl = request.nextUrl.clone();
        suspendedUrl.pathname = "/suspended";
        return NextResponse.redirect(suspendedUrl);
      }
    }
  }

  if (user && isProtectedSuperAdminEmail(user.email) && !hasGodModeFlag) {
    await supabase.from("profiles").update({ active_company_id: null }).eq("id", user.id);
    supabaseResponse.cookies.set(PLATFORM_CONTEXT_COOKIE, "", {
      path: "/",
      maxAge: 0,
      sameSite: "lax",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
    });
    supabaseResponse.cookies.set(PLATFORM_GOD_MODE_COOKIE, "", {
      path: "/",
      maxAge: 0,
      sameSite: "lax",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
    });
  }

  if (user && isProtectedPath && isProtectedSuperAdminEmail(user.email)) {
    if (!hasGodModeFlag) {
      await supabase.from("profiles").update({ active_company_id: null }).eq("id", user.id);
      if (!isPlatformConsole) {
        const forceUrl = request.nextUrl.clone();
        forceUrl.pathname = "/dashboard/admin/platform";
        const response = NextResponse.redirect(forceUrl);
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
    }
  }

  if (user && isAuthPage) {
    if (isPlatformAdminSession) {
      await supabase.from("profiles").update({ active_company_id: null }).eq("id", user.id);
      const adminUrl = request.nextUrl.clone();
      adminUrl.pathname = "/dashboard/admin/platform";
      const response = NextResponse.redirect(adminUrl);
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

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role, role_id, permissions, access_work_list, roles:role_id(permissions)")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || !profile) {
      const fallbackUrl = request.nextUrl.clone();
      fallbackUrl.pathname = "/login";
      fallbackUrl.searchParams.set("notice", "missing_profile");
      return NextResponse.redirect(fallbackUrl);
    }

    const url = request.nextUrl.clone();
    const typedProfile = (profile ?? null) as MiddlewareProfile | null;
    if (typedProfile?.access_work_list) {
      url.pathname = "/tasks/my-work";
    } else if (typedProfile?.role === "technician" || typedProfile?.role === "supervisor" || typedProfile?.role === "data_entry") {
      url.pathname = "/tasks/my-work";
    } else if (typedProfile?.role === "reporter" || typedProfile?.role === "engineer") {
      url.pathname = "/dashboard/tickets";
    } else {
      url.pathname = "/dashboard";
    }
    return NextResponse.redirect(url);
  }

  if (user && path.startsWith("/dashboard")) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, role_id, permissions, access_work_list, active_company_id, company_id, roles:role_id(permissions)")
      .eq("id", user.id)
      .maybeSingle();

    const typedProfile = (profile ?? null) as MiddlewareProfile | null;
    if (isPlatformAdminSession && path === "/dashboard" && !hasGodModeFlag) {
      const adminUrl = request.nextUrl.clone();
      adminUrl.pathname = "/dashboard/admin/platform";
      return NextResponse.redirect(adminUrl);
    }

    if (typedProfile?.access_work_list || typedProfile?.role === "technician" || typedProfile?.role === "supervisor" || typedProfile?.role === "data_entry") {
      const url = request.nextUrl.clone();
      url.pathname = "/tasks/my-work";
      return NextResponse.redirect(url);
    }

    const rolePerms = Array.isArray(typedProfile?.roles) ? typedProfile.roles[0]?.permissions : typedProfile?.roles?.permissions;
    const raw = { ...(rolePerms ?? {}), ...((typedProfile?.permissions as Record<string, unknown> | null | undefined) ?? {}) };
    const canAccess = canAccessDashboardPath(path, typedProfile?.role, raw ?? null);
    console.info("[rbac-path-access]", {
      path,
      role: typedProfile?.role ?? null,
      role_id: typedProfile?.role_id ?? null,
      decision: canAccess ? "allow" : "deny",
    });
    if (!canAccess) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
