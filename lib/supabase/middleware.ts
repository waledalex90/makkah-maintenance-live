import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { canAccessDashboardPath } from "@/lib/permissions";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

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

  if (!user && isProtectedPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && isAuthPage) {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role, permissions, access_work_list")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || !profile) {
      const fallbackUrl = request.nextUrl.clone();
      fallbackUrl.pathname = "/login";
      fallbackUrl.searchParams.set("notice", "missing_profile");
      return NextResponse.redirect(fallbackUrl);
    }

    const url = request.nextUrl.clone();
    if (profile.access_work_list) {
      url.pathname = "/tasks/my-work";
    } else if (profile.role === "technician" || profile.role === "supervisor" || profile.role === "data_entry") {
      url.pathname = "/tasks/my-work";
    } else if (profile.role === "reporter" || profile.role === "engineer") {
      url.pathname = "/dashboard/tickets";
    } else {
      url.pathname = "/dashboard";
    }
    return NextResponse.redirect(url);
  }

  if (user && path.startsWith("/dashboard")) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, permissions, access_work_list")
      .eq("id", user.id)
      .maybeSingle();

    if (
      profile?.access_work_list ||
      profile?.role === "technician" ||
      profile?.role === "supervisor" ||
      profile?.role === "data_entry"
    ) {
      const url = request.nextUrl.clone();
      url.pathname = "/tasks/my-work";
      return NextResponse.redirect(url);
    }

    const raw = profile?.permissions as Record<string, unknown> | null | undefined;
    if (!canAccessDashboardPath(path, profile?.role, raw ?? null)) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
