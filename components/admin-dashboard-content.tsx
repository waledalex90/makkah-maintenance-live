"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import {
  applyTicketDashboardFilters,
  mergeDashboardSearchParams,
  parseDashboardFiltersFromSearchParams,
  type DashboardBaseFilters,
} from "@/lib/admin-dashboard-filters";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { TicketCreateForm } from "@/components/ticket-create-form";
import { TicketChatPanel } from "@/components/ticket-chat-panel";
import { TicketReceptionCaption } from "@/components/ticket-reception-caption";
import { UserIdentityHeader } from "@/components/user-identity-header";
import { TICKET_ROW_WITH_HANDLER_PROFILES } from "@/lib/ticket-handler-select";
import { ticketReceptionExportLine } from "@/lib/ticket-reception-label";
import {
  type TicketStatus,
  statusBadgeVariant,
  statusDotClass,
  statusLabelAr,
} from "@/lib/ticket-status";
import { arabicErrorMessage } from "@/lib/arabic-errors";
import { isProtectedSuperAdminEmail } from "@/lib/protected-super-admin";
import {
  formatSaudiDateTime,
  formatSaudiNow,
  getAgeMinutes,
  relativeAgeLabelSaudi,
} from "@/lib/saudi-time";

type Zone = {
  id: string;
  name: string;
  center_latitude?: number | null;
  center_longitude?: number | null;
  latitude?: number | null;
  longitude?: number | null;
};

/** فلتر بطاقات الإحصاء: إجمالي، متأخر الاستلام، قيد التنفيذ، مكتمل */
type StatFilter = "all" | "late_pickup" | "received" | "finished";
type CategoryJoin = { name: string } | { name: string }[] | null;

type TicketRow = {
  id: string;
  ticket_number?: number | null;
  external_ticket_number?: string | null;
  reporter_name?: string | null;
  reporter_phone?: string | null;
  title?: string | null;
  category_id?: number | null;
  shaqes_notes?: string | null;
  ticket_categories?: CategoryJoin;
  location: string;
  description: string;
  latitude?: number | null;
  longitude?: number | null;
  status: TicketStatus;
  assigned_engineer_id: string | null;
  assigned_supervisor_id: string | null;
  assigned_technician_id: string | null;
  zone_id: string | null;
  created_at: string;
  closed_at?: string | null;
  closed_by?: string | null;
  assigned_technician?: { full_name: string } | null;
  assigned_supervisor?: { full_name: string } | null;
  assigned_engineer?: { full_name: string } | null;
  closed_by_profile?: { full_name: string } | null;
};

type TicketAttachmentRow = {
  id: number;
  file_url: string;
  file_type: string;
  created_at: string;
  file_name: string | null;
  sort_order: number;
};

type DetailStaffRow = {
  user_id: string;
  latitude: number;
  longitude: number;
  last_updated: string;
  profiles?: {
    full_name: string;
    role: string;
    availability_status?: "available" | "busy" | "offline" | null;
  } | {
    full_name: string;
    role: string;
    availability_status?: "available" | "busy" | "offline" | null;
  }[] | null;
};

type TicketChatRow = {
  ticket_id: string;
  sent_at: string;
};

type AdminDashboardContentProps = {
  role?: string;
  tableOnly?: boolean;
};

const PAGE_SIZE = 20;
const LAST_READ_STORAGE_KEY = "admin_ticket_last_read_map";
const PICKUP_SLACK_MINUTES = 2;
const ONLINE_WINDOW_MS = 2 * 60 * 1000;
const NEARBY_RADIUS_METERS = 3000;

const TicketDetailLiveMap = dynamic(
  () => import("@/components/ticket-detail-live-map").then((m) => m.TicketDetailLiveMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-72 items-center justify-center rounded-xl border border-slate-200 bg-slate-100 text-sm text-slate-600">
        جاري تحميل الخريطة…
      </div>
    ),
  },
);

function categoryBadgeColor(categoryName: string): string {
  const lower = categoryName.toLowerCase();
  if (lower.includes("حريق") || lower.includes("fire")) return "bg-red-100 text-red-700 border-red-200";
  if (lower.includes("كهرباء") || lower.includes("electric")) return "bg-amber-100 text-amber-700 border-amber-200";
  if (lower.includes("تكييف") || lower.includes("ac")) return "bg-sky-100 text-sky-700 border-sky-200";
  if (lower.includes("مدني") || lower.includes("civil")) return "bg-stone-100 text-stone-700 border-stone-200";
  if (lower.includes("مطابخ") || lower.includes("kitchen")) return "bg-violet-100 text-violet-700 border-violet-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

function normalizeCategoryName(category: CategoryJoin | undefined): string {
  if (!category) return "-";
  if (Array.isArray(category)) return category[0]?.name ?? "-";
  return category.name;
}

/** ترتيب مسؤول البلاغات: متأخر الاستلام أولاً، ثم قيد التنفيذ، ثم الباقي (الأحدث داخل كل مجموعة) */
function sortReporterTickets(rows: TicketRow[], nowMs: number): TicketRow[] {
  return [...rows].sort((a, b) => {
    const ca = new Date(a.created_at).getTime();
    const cb = new Date(b.created_at).getTime();
    const ageA = (nowMs - ca) / 60_000;
    const ageB = (nowMs - cb) / 60_000;
    const tier = (t: TicketRow, ageMin: number) => {
      if (t.status === "not_received" && ageMin > PICKUP_SLACK_MINUTES) return 0;
      if (t.status === "received") return 1;
      if (t.status === "not_received") return 2;
      return 3;
    };
    const ta = tier(a, ageA);
    const tb = tier(b, ageB);
    if (ta !== tb) return ta - tb;
    return cb - ca;
  });
}

function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const r = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return r * c;
}

export function AdminDashboardContent({ role = "admin", tableOnly = false }: AdminDashboardContentProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  /** يُعرض على واجهة مسؤول البلاغات (صفحة البلاغات) */
  const isReporterDesk = tableOnly;

  const urlFilters = useMemo(() => parseDashboardFiltersFromSearchParams(searchParams), [searchParams]);
  const baseFilters: DashboardBaseFilters = useMemo(
    () => ({
      zoneId: urlFilters.zoneId,
      categoryId: urlFilters.categoryId,
      dateFrom: urlFilters.dateFrom,
      dateTo: urlFilters.dateTo,
    }),
    [urlFilters.zoneId, urlFilters.categoryId, urlFilters.dateFrom, urlFilters.dateTo],
  );

  const zoneFilter = urlFilters.zoneId;
  const statusFilter = urlFilters.statusTable;
  const statFilter = urlFilters.statCard as StatFilter;
  const searchTerm = urlFilters.search;
  const currentPage = urlFilters.page;

  const [searchDraft, setSearchDraft] = useState(urlFilters.search);
  useEffect(() => {
    setSearchDraft(urlFilters.search);
  }, [urlFilters.search]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      const trimmed = searchDraft.trim();
      if (trimmed === searchTerm) return;
      const next = mergeDashboardSearchParams(searchParams, { q: trimmed || undefined }, true);
      router.replace(`${pathname}?${next}`, { scroll: false });
    }, 320);
    return () => window.clearTimeout(t);
  }, [searchDraft, searchTerm, pathname, router, searchParams]);

  const patchDashboard = useCallback(
    (patch: Partial<Record<string, string | undefined>>, resetPage = true) => {
      const next = mergeDashboardSearchParams(searchParams, patch, resetPage);
      router.replace(`${pathname}?${next}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const goDashboardPage = useCallback(
    (p: number) => {
      const next = new URLSearchParams(searchParams.toString());
      if (p <= 1) next.delete("p");
      else next.set("p", String(p));
      router.replace(`${pathname}?${next}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<TicketRow | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailAttachments, setDetailAttachments] = useState<TicketAttachmentRow[]>([]);
  const [detailNearbyStaff, setDetailNearbyStaff] = useState<DetailStaffRow[]>([]);
  const [latestChatMap, setLatestChatMap] = useState<Record<string, string>>({});
  const [lastReadMap, setLastReadMap] = useState<Record<string, string>>({});
  const [nowTs, setNowTs] = useState(() => Date.now());
  const [headerRefreshing, setHeaderRefreshing] = useState(false);
  const openedTicketQueryRef = useRef<string | null>(null);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [ticketDeleteDialogOpen, setTicketDeleteDialogOpen] = useState(false);
  const [ticketDeleting, setTicketDeleting] = useState(false);

  const isSuperAdminSession = isProtectedSuperAdminEmail(sessionEmail);

  useEffect(() => {
    const lockBody = createModalOpen || detailModalOpen || ticketDeleteDialogOpen;
    if (!lockBody) return;
    const prevOverflow = document.body.style.overflow;
    const prevOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.overscrollBehavior = prevOverscroll;
    };
  }, [createModalOpen, detailModalOpen, ticketDeleteDialogOpen]);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      setSessionEmail(data.user?.email?.trim().toLowerCase() ?? null);
    });
  }, []);

  const zonesQuery = useQuery({
    queryKey: ["dashboard-zones"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("zones")
        .select("id, name, center_latitude, center_longitude, latitude, longitude")
        .order("name");
      if (error) throw new Error(arabicErrorMessage(error.message));
      return (data ?? []) as Zone[];
    },
    staleTime: 5 * 60_000,
  });
  const zones = zonesQuery.data ?? [];

  const categoriesQuery = useQuery({
    queryKey: ["ticket-categories-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("ticket_categories").select("id, name").order("name");
      if (error) throw new Error(arabicErrorMessage(error.message));
      return (data ?? []) as Array<{ id: number; name: string }>;
    },
    staleTime: 5 * 60_000,
  });
  const ticketCategories = categoriesQuery.data ?? [];

  const statsQuery = useQuery({
    queryKey: ["admin-dashboard-stats", baseFilters, nowTs],
    queryFn: async () => {
      const thresholdIso = new Date(nowTs - PICKUP_SLACK_MINUTES * 60 * 1000).toISOString();
      const bf = baseFilters;
      const totalQ = applyTicketDashboardFilters(supabase.from("tickets").select("id", { count: "exact", head: true }), bf);
      const receivedQ = applyTicketDashboardFilters(
        supabase.from("tickets").select("id", { count: "exact", head: true }).eq("status", "received"),
        bf,
      );
      const finishedQ = applyTicketDashboardFilters(
        supabase.from("tickets").select("id", { count: "exact", head: true }).eq("status", "finished"),
        bf,
      );
      const lateQ = applyTicketDashboardFilters(
        supabase
          .from("tickets")
          .select("id", { count: "exact", head: true })
          .eq("status", "not_received")
          .lte("created_at", thresholdIso),
        bf,
      );
      const notReceivedQ = applyTicketDashboardFilters(
        supabase.from("tickets").select("id", { count: "exact", head: true }).eq("status", "not_received"),
        bf,
      );

      const [totalRes, receivedRes, finishedRes, lateRes, notReceivedRes] = await Promise.all([
        totalQ,
        receivedQ,
        finishedQ,
        lateQ,
        notReceivedQ,
      ]);
      const err =
        totalRes.error || receivedRes.error || finishedRes.error || lateRes.error || notReceivedRes.error;
      if (err) throw new Error(arabicErrorMessage(err.message));
      return {
        total: totalRes.count ?? 0,
        inProgress: receivedRes.count ?? 0,
        completed: finishedRes.count ?? 0,
        latePickup: lateRes.count ?? 0,
        notReceived: notReceivedRes.count ?? 0,
      };
    },
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  });

  const ticketStats = statsQuery.data ?? {
    total: 0,
    latePickup: 0,
    inProgress: 0,
    completed: 0,
    notReceived: 0,
  };

  useEffect(() => {
    const timer = window.setInterval(() => setNowTs(Date.now()), 10_000);
    return () => window.clearInterval(timer);
  }, []);

  const ticketsQuery = useQuery({
    queryKey: [
      "admin-dashboard-tickets",
      baseFilters,
      statusFilter,
      statFilter,
      searchTerm,
      currentPage,
      nowTs,
      isReporterDesk,
    ],
    queryFn: async () => {
      const from = (currentPage - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let query = applyTicketDashboardFilters(
        supabase
          .from("tickets")
          .select(TICKET_ROW_WITH_HANDLER_PROFILES, { count: "exact" })
          .order("created_at", { ascending: false })
          .range(from, to),
        baseFilters,
      );

      if (statFilter === "late_pickup") {
        query = query
          .eq("status", "not_received")
          .lte("created_at", new Date(nowTs - PICKUP_SLACK_MINUTES * 60 * 1000).toISOString());
      } else if (statFilter === "received") {
        query = query.eq("status", "received");
      } else if (statFilter === "finished") {
        query = query.eq("status", "finished");
      } else if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const q = searchTerm.trim();
      if (q) {
        const matchedZoneIds = zones
          .filter((zone) => zone.name.toLowerCase().includes(q.toLowerCase()))
          .map((zone) => zone.id);
        const { data: catRows } = await supabase.from("ticket_categories").select("id").ilike("name", `%${q}%`);
        const matchedCategoryIds = (catRows ?? []).map((r) => r.id as number);

        const orParts = [`external_ticket_number.ilike.%${q}%`, `ticket_number_text.ilike.%${q}%`];
        if (matchedZoneIds.length > 0) {
          const quoted = matchedZoneIds.map((id) => `"${id}"`).join(",");
          orParts.push(`zone_id.in.(${quoted})`);
        }
        if (matchedCategoryIds.length > 0) {
          orParts.push(`category_id.in.(${Array.from(new Set(matchedCategoryIds)).join(",")})`);
        }
        query = query.or(orParts.join(","));
      }

      const { data, error, count } = await query;

      if (error) {
        throw new Error(arabicErrorMessage(error.message));
      }

      const rowsRaw = (data as unknown as TicketRow[]) ?? [];
      const rows = isReporterDesk ? sortReporterTickets(rowsRaw, nowTs) : rowsRaw;
      return { rows, count: count ?? 0 };
    },
    placeholderData: (prev) => prev,
    staleTime: 20_000,
  });

  useEffect(() => {
    if (!ticketsQuery.isError || !ticketsQuery.error) return;
    toast.error((ticketsQuery.error as Error).message);
  }, [ticketsQuery.isError, ticketsQuery.error]);

  useEffect(() => {
    if (!statsQuery.isError || !statsQuery.error) return;
    toast.error((statsQuery.error as Error).message);
  }, [statsQuery.isError, statsQuery.error]);

  const pageTickets = ticketsQuery.data?.rows ?? [];
  const totalCount = ticketsQuery.data?.count ?? 0;
  const loading = ticketsQuery.isPending && ticketsQuery.data === undefined;

  useEffect(() => {
    const ticketIds = pageTickets.map((t) => t.id);
    if (ticketIds.length === 0) {
      setLatestChatMap({});
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("ticket_chats")
        .select("ticket_id, sent_at")
        .in("ticket_id", ticketIds)
        .order("sent_at", { ascending: false });

      if (error || cancelled) return;

      const map: Record<string, string> = {};
      ((data as TicketChatRow[]) ?? []).forEach((row) => {
        if (!map[row.ticket_id]) {
          map[row.ticket_id] = row.sent_at;
        }
      });
      setLatestChatMap(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [pageTickets]);

  const zoneNameMap = useMemo(() => {
    const map = new Map<string, string>();
    zones.forEach((zone) => map.set(zone.id, zone.name));
    return map;
  }, [zones]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(LAST_READ_STORAGE_KEY);
      if (stored) {
        setLastReadMap(JSON.parse(stored) as Record<string, string>);
      }
    } catch {
      setLastReadMap({});
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(LAST_READ_STORAGE_KEY, JSON.stringify(lastReadMap));
  }, [lastReadMap]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  useEffect(() => {
    if (currentPage <= totalPages || totalPages < 1) return;
    goDashboardPage(totalPages);
  }, [currentPage, totalPages, goDashboardPage]);

  const openTicketModal = async (ticket: TicketRow) => {
    setSelectedTicket(ticket);
    setDetailModalOpen(true);
    setDetailLoading(true);
    setLastReadMap((prev) => ({ ...prev, [ticket.id]: new Date().toISOString() }));
    const [ticketRes, attachmentsRes, staffRes] = await Promise.all([
      supabase
        .from("tickets")
        .select(TICKET_ROW_WITH_HANDLER_PROFILES)
        .eq("id", ticket.id)
        .single(),
      supabase
        .from("ticket_attachments")
        .select("id, file_url, file_type, created_at, file_name, sort_order")
        .eq("ticket_id", ticket.id)
        .order("sort_order", { ascending: true })
        .order("id", { ascending: true }),
      supabase
        .from("live_locations")
        .select("user_id, latitude, longitude, last_updated, profiles(full_name, role, availability_status)"),
    ]);
    if (ticketRes.error) {
      toast.error("تعذر تحميل تفاصيل البلاغ.");
    } else if (ticketRes.data) {
      setSelectedTicket(ticketRes.data as unknown as TicketRow);
    }
    setDetailAttachments((attachmentsRes.data as TicketAttachmentRow[]) ?? []);
    const ticketData = (ticketRes.data as unknown as TicketRow | null) ?? ticket;
    let ticketZoneCenter: [number, number] | null = null;
    if (ticketData.zone_id) {
      const zone = zones.find((z) => z.id === ticketData.zone_id);
      if (zone) {
        const lat = zone.center_latitude ?? zone.latitude ?? null;
        const lng = zone.center_longitude ?? zone.longitude ?? null;
        if (lat !== null && lng !== null) ticketZoneCenter = [lat, lng];
      }
    }
    const focusLat = ticketData.latitude ?? ticketZoneCenter?.[0] ?? null;
    const focusLng = ticketData.longitude ?? ticketZoneCenter?.[1] ?? null;
    const rows = ((staffRes.data as DetailStaffRow[]) ?? []).filter((row) => {
      const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      if (!profile) return false;
      if (!["technician", "supervisor"].includes(profile.role)) return false;
      if (focusLat === null || focusLng === null) return false;
      return distanceMeters(row.latitude, row.longitude, focusLat, focusLng) <= NEARBY_RADIUS_METERS;
    });
    setDetailNearbyStaff(rows);
    setDetailLoading(false);
    toast.success("تم فتح تفاصيل البلاغ.");
  };

  const openTicketById = async (ticketId: string) => {
    const { data, error } = await supabase
      .from("tickets")
      .select(TICKET_ROW_WITH_HANDLER_PROFILES)
      .eq("id", ticketId)
      .single();

    if (error || !data) {
      toast.error("تعذر فتح تفاصيل البلاغ.");
      return;
    }

    await openTicketModal(data as unknown as TicketRow);
  };

  useEffect(() => {
    if (!tableOnly || typeof window === "undefined") return;
    const q = window.location.search;
    const open = new URLSearchParams(q).get("open");
    if (!open) return;
    const sig = `${q}`;
    if (openedTicketQueryRef.current === sig) return;
    openedTicketQueryRef.current = sig;
    void openTicketById(open);
    window.history.replaceState({}, "", "/dashboard/tickets");
  }, [tableOnly]);

  const refreshAfterDetailAction = async () => {
    await queryClient.invalidateQueries({ queryKey: ["admin-dashboard-stats"] });
    await queryClient.invalidateQueries({ queryKey: ["admin-dashboard-tickets"] });
    if (selectedTicket) {
      const { data } = await supabase
        .from("tickets")
        .select(TICKET_ROW_WITH_HANDLER_PROFILES)
        .eq("id", selectedTicket.id)
        .single();

      if (data) {
        const row = data as unknown as TicketRow;
        setSelectedTicket(row);
      }
    }
  };

  const confirmDeleteTicket = async () => {
    if (!selectedTicket) return;
    setTicketDeleting(true);
    try {
      const res = await fetch(`/api/admin/tickets/${selectedTicket.id}`, { method: "DELETE" });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? "تعذر حذف البلاغ.");
        return;
      }
      toast.success("تم حذف البلاغ نهائياً من النظام.");
      setTicketDeleteDialogOpen(false);
      setDetailModalOpen(false);
      setSelectedTicket(null);
      await queryClient.invalidateQueries({ queryKey: ["admin-dashboard-stats"] });
      await queryClient.invalidateQueries({ queryKey: ["admin-dashboard-tickets"] });
    } finally {
      setTicketDeleting(false);
    }
  };

  useEffect(() => {
    const channel = supabase
      .channel("tickets-admin-advanced-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "tickets" },
        (payload) => {
          const newTicket = payload.new as TicketRow;
          toast.success(`بلاغ جديد: ${newTicket.title ?? newTicket.location ?? newTicket.id}`, {
            action: {
              label: "فتح",
              onClick: () => {
                void openTicketById(newTicket.id);
              },
            },
          });
          void queryClient.invalidateQueries({ queryKey: ["admin-dashboard-stats"] });
          void queryClient.invalidateQueries({ queryKey: ["admin-dashboard-tickets"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "tickets" },
        async (payload) => {
          const updated = payload.new as TicketRow;
          if (selectedTicket?.id === updated.id) {
            setSelectedTicket((prev) => (prev ? { ...prev, ...updated } : prev));
          }
          await queryClient.invalidateQueries({ queryKey: ["admin-dashboard-stats"] });
          await queryClient.invalidateQueries({ queryKey: ["admin-dashboard-tickets"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "ticket_chats" },
        (payload) => {
          const row = payload.new as TicketChatRow;
          setLatestChatMap((prev) => ({ ...prev, [row.ticket_id]: row.sent_at }));
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [selectedTicket?.id, queryClient]);

  const zoneMap = useMemo(() => {
    const map = new Map<string, Zone>();
    zones.forEach((zone) => map.set(zone.id, zone));
    return map;
  }, [zones]);

  const canPostChatInModal = [
    "engineer",
    "supervisor",
    "technician",
    "admin",
    "project_manager",
    "projects_director",
  ].includes(role);

  const exportCurrentView = () => {
    const headers = ["رقم البلاغ", "التصنيف", "المنطقة", "مقدم البلاغ", "الوصف", "الحالة", "متابعة الاستلام", "العمر الزمني"];
    const rows = pageTickets.map((ticket) => [
      String(ticket.external_ticket_number || ticket.ticket_number || ticket.id.slice(0, 8)),
      normalizeCategoryName(ticket.ticket_categories),
      ticket.zone_id ? zoneNameMap.get(ticket.zone_id) ?? "-" : "-",
      ticket.reporter_name || "-",
      (ticket.description || ticket.title || ticket.location || "-").replace(/\r?\n/g, " "),
      statusLabelAr(ticket.status),
      ticketReceptionExportLine(ticket),
      relativeAgeLabelSaudi(ticket.created_at, nowTs),
    ]);
    const csv = [headers, ...rows]
      .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const fileDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Riyadh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(nowTs));
    a.download = `بلاغات-${fileDate}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("تم تصدير البلاغات المعروضة بنجاح.");
  };

  const refreshDashboardQueries = async () => {
    if (headerRefreshing) return;
    setHeaderRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ["admin-dashboard-stats"] });
      await queryClient.invalidateQueries({ queryKey: ["admin-dashboard-tickets"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard-zones"] });
      await queryClient.invalidateQueries({ queryKey: ["ticket-categories-list"] });
      toast.success("تم تحديث البيانات.");
    } finally {
      setHeaderRefreshing(false);
    }
  };

  return (
    <div className="relative space-y-6 bg-white text-slate-900" dir="rtl" lang="ar" style={{ colorScheme: "light" }}>
      {!tableOnly ? <UserIdentityHeader /> : null}

      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          className="h-10 w-10 shrink-0 p-0"
          disabled={headerRefreshing}
          onClick={() => void refreshDashboardQueries()}
          aria-label="تحديث اللوحة"
        >
          <RefreshCw className={`size-4 ${headerRefreshing ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <header className="flex flex-col gap-3 border-b border-slate-200 bg-white pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{tableOnly ? "مركز البلاغات" : "لوحة التحكم"}</h1>
          <p className="mt-1 text-sm text-slate-600">
            {tableOnly
              ? role === "reporter"
                ? "متابعة البلاغات — التوقيت يُحسب بتوقيت مكة المكرمة. لإدارة المهام والتنبيهات الزمنية استخدم تبويب «المهام»."
                : "متابعة البلاغات — التوقيت يُحسب بتوقيت مكة المكرمة"
              : "مؤشرات البلاغات وإنشاء بلاغ جديد"}
          </p>
          <p className="mt-1 text-xs text-slate-500" suppressHydrationWarning>
            التوقيت الحالي (مكة): {formatSaudiNow(nowTs)}
          </p>
        </div>
        <Button
          type="button"
          className="h-11 min-w-[200px] shrink-0 bg-slate-900 text-base text-white hover:bg-slate-800"
          onClick={() => setCreateModalOpen(true)}
        >
          + إنشاء بلاغ جديد
        </Button>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <button
          type="button"
          className="text-right"
          onClick={() => patchDashboard({ sf: "all", tst: "all" })}
        >
          <Card
            className={
              statFilter === "all" && statusFilter === "all" ? "ring-2 ring-sky-500" : ""
            }
          >
            <CardHeader className="p-3 pb-1">
              <CardTitle className="text-sm md:text-base">إجمالي البلاغات</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <p className="text-xl font-semibold text-sky-700 md:text-2xl">{ticketStats.total}</p>
            </CardContent>
          </Card>
        </button>
        <button
          type="button"
          className="text-right"
          onClick={() => patchDashboard({ sf: "all", tst: "not_received" })}
        >
          <Card
            className={
              statFilter === "all" && statusFilter === "not_received" ? "ring-2 ring-sky-400" : ""
            }
          >
            <CardHeader className="p-3 pb-1">
              <CardTitle className="text-sm md:text-base">بلاغات جديدة</CardTitle>
              <p className="text-[10px] font-normal text-slate-500">لم يُستلم بعد</p>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <p className="text-xl font-semibold text-sky-800 md:text-2xl">{ticketStats.notReceived}</p>
            </CardContent>
          </Card>
        </button>
        <button
          type="button"
          className="text-right"
          onClick={() => patchDashboard({ sf: "late_pickup", tst: "all" })}
        >
          <Card className={statFilter === "late_pickup" ? "ring-2 ring-amber-400" : ""}>
            <CardHeader className="p-3 pb-1">
              <CardTitle className="text-sm md:text-base">متأخرة الاستلام</CardTitle>
              <p className="text-[10px] font-normal text-slate-500">&gt; دقيقتين</p>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <p className="text-xl font-semibold text-amber-700 md:text-2xl">{ticketStats.latePickup}</p>
            </CardContent>
          </Card>
        </button>
        <button
          type="button"
          className="text-right"
          onClick={() => patchDashboard({ sf: "received", tst: "received" })}
        >
          <Card className={statFilter === "received" ? "ring-2 ring-amber-400" : ""}>
            <CardHeader className="p-3 pb-1">
              <CardTitle className="text-sm md:text-base">قيد التنفيذ</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <p className="text-xl font-semibold text-amber-600 md:text-2xl">{ticketStats.inProgress}</p>
            </CardContent>
          </Card>
        </button>
        <button
          type="button"
          className="text-right"
          onClick={() => patchDashboard({ sf: "finished", tst: "finished" })}
        >
          <Card className={statFilter === "finished" ? "ring-2 ring-emerald-500" : ""}>
            <CardHeader className="p-3 pb-1">
              <CardTitle className="text-sm md:text-base">مكتملة</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <p className="text-xl font-semibold text-emerald-600 md:text-2xl">{ticketStats.completed}</p>
            </CardContent>
          </Card>
        </button>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">جدول البلاغات الحالية</h2>
          <p className="text-xs text-slate-500">يعرض أحدث البلاغات مع فلاتر مباشرة</p>
        </div>

        <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          <div>
            <p className="mb-1 text-xs font-medium text-slate-600">المنطقة</p>
            <select
              className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-xs md:text-sm"
              value={zoneFilter}
              onChange={(e) => patchDashboard({ zf: e.target.value })}
            >
              <option value="all">كل المناطق</option>
              {zones.map((zone) => (
                <option key={zone.id} value={zone.id}>
                  {zone.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <p className="mb-1 text-xs font-medium text-slate-600">التصنيف</p>
            <select
              className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-xs md:text-sm"
              value={urlFilters.categoryId}
              onChange={(e) => patchDashboard({ cat: e.target.value })}
            >
              <option value="all">كل التصنيفات</option>
              {ticketCategories.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <p className="mb-1 text-xs font-medium text-slate-600">من تاريخ</p>
            <Input
              className="h-9 text-xs md:text-sm"
              type="date"
              value={urlFilters.dateFrom}
              onChange={(e) => patchDashboard({ df: e.target.value || undefined })}
            />
          </div>

          <div>
            <p className="mb-1 text-xs font-medium text-slate-600">إلى تاريخ</p>
            <Input
              className="h-9 text-xs md:text-sm"
              type="date"
              value={urlFilters.dateTo}
              onChange={(e) => patchDashboard({ dt: e.target.value || undefined })}
            />
          </div>

          <div>
            <p className="mb-1 text-xs font-medium text-slate-600">الحالة</p>
            <select
              className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-xs md:text-sm"
              value={statusFilter}
              onChange={(e) => patchDashboard({ tst: e.target.value, sf: "all" })}
            >
              <option value="all">كل الحالات</option>
              <option value="not_received">لم يستلم (جديد)</option>
              <option value="received">تم الاستلام</option>
              <option value="finished">تم الانتهاء</option>
            </select>
          </div>

          <div className="min-w-0 sm:col-span-2 lg:col-span-1 xl:col-span-1">
            <p className="mb-1 text-xs font-medium text-slate-600">بحث سريع</p>
            <Input
              className="h-9 text-xs md:text-sm"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              placeholder="رقم، منطقة، تصنيف…"
            />
          </div>

          <div className="flex flex-col gap-1 sm:col-span-2 lg:col-span-1 xl:col-span-1">
            <p className="mb-1 text-xs font-medium text-slate-600 opacity-0">—</p>
            <div className="flex gap-2">
              <Button variant="outline" className="h-9 flex-1 text-xs" type="button" onClick={exportCurrentView}>
                تصدير
              </Button>
              <Button
                variant="outline"
                className="h-9 flex-1 border-dashed text-xs text-slate-600"
                type="button"
                onClick={() => {
                  setSearchDraft("");
                  router.replace(pathname, { scroll: false });
                }}
              >
                مسح
              </Button>
            </div>
          </div>
        </div>

        <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          عرض {pageTickets.length} بلاغ من {totalCount} بعد الفلترة (الإجمالي العام: {ticketStats.total})
        </div>

        <p className="mb-2 text-xs text-slate-500">
          {isReporterDesk
            ? "ترتيب القائمة: متأخر الاستلام أولًا، ثم قيد التنفيذ، ثم الباقي (الأحدث داخل كل مجموعة) — التوقيت: مكة"
            : "مرتبة حسب الإعدادات والفلاتر — التوقيت: مكة"}
        </p>

        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full text-right text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-3 py-2">رقم البلاغ</th>
                  <th className="px-3 py-2">التصنيف</th>
                  <th className="px-3 py-2">المنطقة</th>
                  <th className="px-3 py-2">مقدم البلاغ</th>
                  <th className="px-3 py-2">الوصف</th>
                  <th className="px-3 py-2">الحالة</th>
                  <th className="px-3 py-2">العمر الزمني</th>
                </tr>
              </thead>
              <tbody>
                {pageTickets.map((ticket) => {
                  const latestChatAt = latestChatMap[ticket.id];
                  const lastReadAt = lastReadMap[ticket.id];
                  const hasUnread = Boolean(
                    latestChatAt && (!lastReadAt || new Date(latestChatAt).getTime() > new Date(lastReadAt).getTime()),
                  );

                  return (
                    <tr
                      key={ticket.id}
                      className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
                      onClick={() => void openTicketModal(ticket)}
                    >
                      <td className="px-3 py-2 font-medium">
                        {ticket.external_ticket_number || ticket.ticket_number || ticket.id.slice(0, 8)}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${categoryBadgeColor(normalizeCategoryName(ticket.ticket_categories))}`}>
                          {normalizeCategoryName(ticket.ticket_categories)}
                        </span>
                      </td>
                      <td className="px-3 py-2">{ticket.zone_id ? zoneNameMap.get(ticket.zone_id) ?? "-" : "-"}</td>
                      <td className="px-3 py-2">{ticket.reporter_name || "-"}</td>
                      <td className="max-w-xs truncate px-3 py-2">{ticket.description || ticket.title || ticket.location}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <span
                              className={`inline-block h-2.5 w-2.5 rounded-full ${statusDotClass(ticket.status)}`}
                            />
                            <Badge variant={statusBadgeVariant(ticket.status)}>{statusLabelAr(ticket.status)}</Badge>
                            {hasUnread ? <span className="h-2.5 w-2.5 rounded-full bg-sky-500" /> : null}
                          </div>
                          <TicketReceptionCaption ticket={ticket} />
                        </div>
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-600">{relativeAgeLabelSaudi(ticket.created_at, nowTs)}</td>
                    </tr>
                  );
                })}
                {pageTickets.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-slate-500">لا توجد بلاغات مطابقة للفلاتر الحالية.</td>
                  </tr>
                ) : null}
              </tbody>
              </table>
            </div>
            <div className="space-y-3 md:hidden">
              {pageTickets.map((ticket) => {
                const latestChatAt = latestChatMap[ticket.id];
                const lastReadAt = lastReadMap[ticket.id];
                const hasUnread = Boolean(
                  latestChatAt && (!lastReadAt || new Date(latestChatAt).getTime() > new Date(lastReadAt).getTime()),
                );
                return (
                  <button
                    key={ticket.id}
                    type="button"
                    className="w-full rounded-xl border border-slate-200 bg-white p-4 text-right shadow-sm"
                    onClick={() => void openTicketModal(ticket)}
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-base font-semibold text-slate-900">
                        {ticket.external_ticket_number || ticket.ticket_number || ticket.id.slice(0, 8)}
                      </p>
                      <Badge variant={statusBadgeVariant(ticket.status)}>{statusLabelAr(ticket.status)}</Badge>
                    </div>
                    <TicketReceptionCaption ticket={ticket} className="mb-2" />
                    <p className="mb-2 text-sm text-slate-700">
                      {ticket.description || ticket.title || ticket.location}
                    </p>
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>{ticket.zone_id ? zoneNameMap.get(ticket.zone_id) ?? "-" : "-"}</span>
                      <span>{relativeAgeLabelSaudi(ticket.created_at, nowTs)}</span>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${categoryBadgeColor(normalizeCategoryName(ticket.ticket_categories))}`}>
                        {normalizeCategoryName(ticket.ticket_categories)}
                      </span>
                      {hasUnread ? <span className="h-2.5 w-2.5 rounded-full bg-sky-500" /> : null}
                    </div>
                  </button>
                );
              })}
              {pageTickets.length === 0 ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-6 text-center text-slate-500">
                  لا توجد بلاغات مطابقة للفلاتر الحالية.
                </div>
              ) : null}
            </div>
          </>
        )}

        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-slate-500">الصفحة {currentPage} من {totalPages}</p>
          <div className="flex items-center gap-2">
            <button
              className="min-h-11 rounded-md border border-slate-200 px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => goDashboardPage(currentPage - 1)}
              disabled={currentPage === 1}
            >
              السابق
            </button>
            <button
              className="min-h-11 rounded-md border border-slate-200 px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => goDashboardPage(currentPage + 1)}
              disabled={currentPage === totalPages}
            >
              التالي
            </button>
          </div>
        </div>
      </section>

      {createModalOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-slate-900/50 p-4" onClick={() => setCreateModalOpen(false)}>
          <div
            className="max-h-[88dvh] w-full max-w-3xl overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-white p-5 text-slate-900 shadow-2xl"
            style={{ colorScheme: "light" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">إنشاء بلاغ جديد</h3>
              <button
                type="button"
                className="rounded-md border border-slate-200 px-3 py-1 text-sm"
                onClick={() => setCreateModalOpen(false)}
              >
                إغلاق
              </button>
            </div>
            <TicketCreateForm
              role={role}
              onCancel={() => setCreateModalOpen(false)}
              onCreated={async () => {
                await queryClient.invalidateQueries({ queryKey: ["admin-dashboard-stats"] });
                await queryClient.invalidateQueries({ queryKey: ["admin-dashboard-tickets"] });
                toast.success("تم حفظ البلاغ وتحديث الجدول.");
              }}
            />
          </div>
        </div>
      ) : null}

      {detailModalOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-slate-900/50 p-4" onClick={() => setDetailModalOpen(false)}>
          <div
            className="max-h-[88dvh] w-full max-w-4xl overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-white p-5 text-slate-900 shadow-2xl"
            style={{ colorScheme: "light" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg font-semibold">تفاصيل البلاغ</h3>
              <div className="flex flex-wrap items-center gap-2">
                {isSuperAdminSession && selectedTicket ? (
                  <button
                    type="button"
                    className="rounded-md border border-red-200 bg-red-50 px-3 py-1 text-sm font-semibold text-red-800 hover:bg-red-100"
                    onClick={() => setTicketDeleteDialogOpen(true)}
                  >
                    حذف البلاغ نهائياً
                  </button>
                ) : null}
                <button
                  type="button"
                  className="rounded-md border border-slate-200 px-3 py-1 text-sm"
                  onClick={() => setDetailModalOpen(false)}
                >
                  إغلاق
                </button>
              </div>
            </div>
            {detailLoading || !selectedTicket ? (
              <p className="text-sm text-slate-500">جاري تحميل التفاصيل...</p>
            ) : (
              <div className="space-y-4 text-sm">
                <TicketDetailLiveMap
                  focusPoint={
                    selectedTicket.latitude && selectedTicket.longitude
                      ? [selectedTicket.latitude, selectedTicket.longitude]
                      : (() => {
                          const zone = selectedTicket.zone_id ? zoneMap.get(selectedTicket.zone_id) : null;
                          const lat = zone?.center_latitude ?? zone?.latitude ?? 21.4225;
                          const lng = zone?.center_longitude ?? zone?.longitude ?? 39.8262;
                          return [lat, lng] as [number, number];
                        })()
                  }
                  ticketLabel={selectedTicket.external_ticket_number || String(selectedTicket.ticket_number || selectedTicket.id.slice(0, 8))}
                  staffPins={detailNearbyStaff.map((staff) => {
                    const profile = Array.isArray(staff.profiles) ? staff.profiles[0] : staff.profiles;
                    const liveStatus = profile?.availability_status ?? (nowTs - new Date(staff.last_updated).getTime() > ONLINE_WINDOW_MS ? "offline" : "available");
                    return {
                      user_id: staff.user_id,
                      full_name: profile?.full_name ?? "موظف",
                      role: profile?.role ?? "موظف",
                      status: liveStatus,
                      latitude: staff.latitude,
                      longitude: staff.longitude,
                    };
                  })}
                />

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div><span className="font-semibold">رقم البلاغ:</span> {selectedTicket.external_ticket_number || selectedTicket.ticket_number || selectedTicket.id}</div>
                    <div><span className="font-semibold">التصنيف:</span> {normalizeCategoryName(selectedTicket.ticket_categories)}</div>
                    <div><span className="font-semibold">المنطقة:</span> {selectedTicket.zone_id ? zoneMap.get(selectedTicket.zone_id)?.name ?? "-" : "-"}</div>
                    <div><span className="font-semibold">مقدم البلاغ:</span> {selectedTicket.reporter_name || "-"}</div>
                    <div dir="ltr" className="text-right">
                      <span className="font-semibold" dir="rtl">
                        رقم تليفون مقدم البلاغ:
                      </span>{" "}
                      {selectedTicket.reporter_phone || "—"}
                    </div>
                    <div><span className="font-semibold">موقع البلاغ:</span> {selectedTicket.title || "-"}</div>
                    <div>
                      <span className="font-semibold">وقت إنشاء البلاغ:</span> {formatSaudiDateTime(selectedTicket.created_at)}
                    </div>
                    {selectedTicket.closed_at ? (
                      <div>
                        <span className="font-semibold">وقت الإغلاق:</span> {formatSaudiDateTime(selectedTicket.closed_at)}
                      </div>
                    ) : null}
                    <div className="flex flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">الحالة:</span>
                        <Badge variant={statusBadgeVariant(selectedTicket.status)}>{statusLabelAr(selectedTicket.status)}</Badge>
                      </div>
                      <TicketReceptionCaption ticket={selectedTicket} />
                    </div>
                  </div>
                  <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div>
                      <p className="mb-1 font-semibold">الوصف</p>
                      <p className="rounded-md bg-white p-3">{selectedTicket.description || "-"}</p>
                    </div>
                  </div>
                </div>

                {selectedTicket.id ? (
                  <TicketChatPanel
                    ticketId={selectedTicket.id}
                    canPost={canPostChatInModal}
                    onTicketUpdated={refreshAfterDetailAction}
                    onMarkTicketRead={(ticketId, readAt) => setLastReadMap((prev) => ({ ...prev, [ticketId]: readAt }))}
                  />
                ) : null}

                <div>
                  <p className="mb-2 font-semibold">المرفقات (صور وفيديو)</p>
                  {detailAttachments.length === 0 ? (
                    <p className="text-slate-500">لا توجد مرفقات.</p>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      {detailAttachments.map((att) => (
                        <div key={att.id} className="space-y-1">
                          <a href={att.file_url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-slate-200">
                            {att.file_type === "video" || /\.(mp4|webm|mov|ogg)(\?|$)/i.test(att.file_url) ? (
                              <video
                                src={att.file_url}
                                className="h-36 w-full object-cover"
                                controls
                                muted
                                playsInline
                                preload="none"
                              />
                            ) : (
                              <img
                                src={att.file_url}
                                alt={att.file_name ?? "مرفق"}
                                width={800}
                                height={288}
                                loading="lazy"
                                decoding="async"
                                className="h-36 w-full object-cover"
                              />
                            )}
                          </a>
                          <p className="text-center text-xs text-slate-600">
                            الرتبة {att.sort_order + 1} — {att.file_name ?? "—"} — {formatSaudiDateTime(att.created_at)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {ticketDeleteDialogOpen && selectedTicket ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 p-4"
          onClick={() => (ticketDeleting ? undefined : setTicketDeleteDialogOpen(false))}
        >
          <div
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className="text-lg font-semibold text-slate-900">تأكيد حذف البلاغ</h4>
            <p className="mt-2 text-sm text-slate-600">
              سيتم حذف البلاغ رقم{" "}
              <span className="font-mono font-semibold">
                {selectedTicket.external_ticket_number || selectedTicket.ticket_number || selectedTicket.id.slice(0, 8)}
              </span>{" "}
              نهائياً من النظام. لا يمكن التراجع عن هذا الإجراء.
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                disabled={ticketDeleting}
                onClick={() => setTicketDeleteDialogOpen(false)}
              >
                إلغاء
              </button>
              <button
                type="button"
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                disabled={ticketDeleting}
                onClick={() => void confirmDeleteTicket()}
              >
                {ticketDeleting ? "جاري الحذف…" : "نعم، احذف نهائياً"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}