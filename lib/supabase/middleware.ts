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
      .select("role, permissions")
      .eq("id", user.id)
      .single();

    if (profileError) {
      const fallbackUrl = request.nextUrl.clone();
      fallbackUrl.pathname = "/dashboard";
      return NextResponse.redirect(fallbackUrl);
    }

    const url = request.nextUrl.clone();
    url.pathname =
      profile?.role === "technician" || profile?.role === "supervisor" ? "/tasks/my-work" : "/dashboard";
    return NextResponse.redirect(url);
  }

  if (user && path.startsWith("/dashboard")) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, permissions")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.role === "technician" || profile?.role === "supervisor") {
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
