"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

export function PlatformRootGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/me", { cache: "no-store" });
        const json = (await res.json()) as {
          ok?: boolean;
          is_protected_super_admin?: boolean;
          is_god_mode?: boolean;
        };
        if (cancelled) return;
        if (
          json.ok &&
          json.is_protected_super_admin &&
          !json.is_god_mode &&
          pathname !== "/dashboard/admin/platform"
        ) {
          router.replace("/dashboard/admin/platform");
        }
      } catch {
        // ignore guard errors; middleware remains the server-side fallback
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  return <>{children}</>;
}
