"use client";

import { useQuery } from "@tanstack/react-query";
import { Briefcase, MapPin, Smartphone } from "lucide-react";
import { supabase } from "@/lib/supabase";

const SPECIALTY_AR: Record<string, string> = {
  fire: "حريق",
  electricity: "كهرباء",
  ac: "تكييف",
  civil: "مدني",
  kitchens: "مطابخ",
};

type ZoneLink = {
  zones: { id: string; name: string } | { id: string; name: string }[] | null;
};

function zonesFromProfile(zoneProfiles: ZoneLink[] | null | undefined): Array<{ id: string; name: string }> {
  const out: Array<{ id: string; name: string }> = [];
  (zoneProfiles ?? []).forEach((link) => {
    const z = Array.isArray(link.zones) ? link.zones[0] : link.zones;
    if (z?.id) out.push({ id: z.id, name: z.name });
  });
  return out;
}

function RegionsSummary({ zones }: { zones: Array<{ id: string; name: string }> }) {
  if (zones.length === 0) {
    return <span className="text-slate-400">—</span>;
  }
  const full = zones.map((z) => z.name).join("، ");
  if (zones.length <= 2) {
    return <span className="text-sm text-slate-700">{full}</span>;
  }
  const firstTwo = zones
    .slice(0, 2)
    .map((z) => z.name)
    .join("، ");
  const rest = zones.length - 2;
  return (
    <span className="text-sm text-slate-700" title={full}>
      {firstTwo}
      <span className="mr-1 text-xs font-medium text-slate-500">+{rest} أخرى</span>
    </span>
  );
}

export function UserIdentityHeader({ compact = false }: { compact?: boolean }) {
  const q = useQuery({
    queryKey: ["identity-header-profile"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) throw new Error("no session");
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("full_name, mobile, job_title, specialty, region, zone_profiles(zones(id,name))")
        .eq("id", user.id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!profile) return null;
      const zp = profile.zone_profiles as ZoneLink[] | null | undefined;
      const zones = zonesFromProfile(zp);
      return {
        full_name: profile.full_name as string,
        mobile: (profile.mobile as string) ?? "",
        job_title: (profile.job_title as string | null) ?? "",
        specialty: (profile.specialty as string | null) ?? "",
        region: (profile.region as string | null) ?? "",
        zones,
      };
    },
    staleTime: 60_000,
  });

  if (q.isPending) {
    return (
      <div
        className={
          compact
            ? "h-16 animate-pulse rounded-xl border border-slate-200/80 bg-white/60 shadow-sm"
            : "mb-4 h-24 animate-pulse rounded-xl border border-slate-200/80 bg-white/60 shadow-sm dark:border-slate-800 dark:bg-slate-900/40"
        }
      />
    );
  }
  if (q.isError || !q.data) {
    return null;
  }

  const row = q.data;
  const specialtyLabel = row.specialty ? SPECIALTY_AR[row.specialty] ?? row.specialty : "—";

  return (
    <section
      className={
        compact
          ? "rounded-xl border border-slate-200/90 bg-gradient-to-br from-white to-slate-50/90 px-3 py-2 shadow-sm"
          : "mb-4 rounded-xl border border-slate-200/90 bg-gradient-to-br from-white to-slate-50/90 px-4 py-3 shadow-sm dark:border-slate-800 dark:from-slate-950 dark:to-slate-900/80"
      }
    >
      <div className="min-w-0 space-y-2 text-right">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">هوية المستخدم</p>
          <p className={compact ? "truncate text-base font-bold text-slate-900" : "truncate text-lg font-bold text-slate-900 dark:text-slate-50"}>
            {row.full_name}
          </p>
          <p className={compact ? "text-xs text-slate-600" : "text-sm text-slate-600 dark:text-slate-300"}>
            <Briefcase className="ms-1 inline size-3.5 align-[-2px] opacity-70" aria-hidden />
            {row.job_title?.trim() ? row.job_title : "—"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
            <Smartphone className="size-3.5 shrink-0 opacity-70" aria-hidden />
            <span dir="ltr" className="truncate">
              {row.mobile || "—"}
            </span>
          </span>
          <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
            <MapPin className="size-3.5 shrink-0 opacity-70" aria-hidden />
            <span className="min-w-0">
              <RegionsSummary zones={row.zones} />
            </span>
          </span>
          <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/60 dark:text-emerald-100">
            التصنيف: {specialtyLabel}
          </span>
          {row.region?.trim() ? (
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
              نطاق: {row.region}
            </span>
          ) : null}
        </div>
      </div>
    </section>
  );
}
