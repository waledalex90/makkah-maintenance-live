"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type TouchEventHandler } from "react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { TicketCreateForm } from "@/components/ticket-create-form";
import { TicketChatPanel } from "@/components/ticket-chat-panel";
import {
  type TicketStatus,
  statusBadgeVariant,
  statusDotClass,
  statusLabelAr,
} from "@/lib/ticket-status";
import { arabicErrorMessage } from "@/lib/arabic-errors";
import {
  formatSaudiDateTime,
  formatSaudiNow,
  formatSaudiTime,
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
};

type TicketAttachmentRow = {
  id: number;
  file_url: string;
  file_type: string;
  created_at: string;
  file_name: string | null;
  sort_order: number;
};

type StaffOptionRow = { staff_id: string; full_name: string };
type AssignableProfileRow = { id: string; full_name: string; specialty?: string | null };

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

function mapCategoryToSpecialty(categoryName: string): string | null {
  const lower = categoryName.toLowerCase();
  if (lower.includes("حريق") || lower.includes("fire")) return "fire";
  if (lower.includes("كهرباء") || lower.includes("electric")) return "electricity";
  if (lower.includes("تكييف") || lower.includes("ac")) return "ac";
  if (lower.includes("مدني") || lower.includes("مدنى") || lower.includes("civil")) return "civil";
  if (lower.includes("مطابخ") || lower.includes("kitchen")) return "kitchens";
  return null;
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
  const [zones, setZones] = useState<Zone[]>([]);
  const [pageTickets, setPageTickets] = useState<TicketRow[]>([]);
  const [zoneFilter, setZoneFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [statFilter, setStatFilter] = useState<StatFilter>("all");
  /** يُعرض على واجهة مسؤول البلاغات (صفحة البلاغات) */
  const isReporterDesk = tableOnly;
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [ticketStats, setTicketStats] = useState({
    total: 0,
    latePickup: 0,
    inProgress: 0,
    completed: 0,
  });
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<TicketRow | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailAttachments, setDetailAttachments] = useState<TicketAttachmentRow[]>([]);
  const [detailNearbyStaff, setDetailNearbyStaff] = useState<DetailStaffRow[]>([]);
  const [modalSupervisorOptions, setModalSupervisorOptions] = useState<StaffOptionRow[]>([]);
  const [modalTechnicianOptions, setModalTechnicianOptions] = useState<StaffOptionRow[]>([]);
  const [modalSupervisorPick, setModalSupervisorPick] = useState("");
  const [modalTechnicianPick, setModalTechnicianPick] = useState("");
  const [modalDispatching, setModalDispatching] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [latestChatMap, setLatestChatMap] = useState<Record<string, string>>({});
  const [lastReadMap, setLastReadMap] = useState<Record<string, string>>({});
  const [nowTs, setNowTs] = useState(() => Date.now());
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [pullStartY, setPullStartY] = useState<number | null>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const openedTicketQueryRef = useRef<string | null>(null);

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

  useEffect(() => {
    const loadMyUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setMyUserId(user?.id ?? null);
    };
    void loadMyUser();
  }, []);

  const loadZones = async () => {
    const { data, error } = await supabase
      .from("zones")
      .select("id, name, center_latitude, center_longitude, latitude, longitude")
      .order("name");
    if (error) {
      toast.error(arabicErrorMessage(error.message));
      return;
    }
    setZones(data ?? []);
  };

  const loadTicketStats = useCallback(async (clock?: number) => {
    const t = clock ?? nowTs;
    const thresholdIso = new Date(t - PICKUP_SLACK_MINUTES * 60 * 1000).toISOString();
    const [totalRes, receivedRes, finishedRes, lateRes] = await Promise.all([
      supabase.from("tickets").select("*", { count: "exact", head: true }),
      supabase.from("tickets").select("*", { count: "exact", head: true }).eq("status", "received"),
      supabase.from("tickets").select("*", { count: "exact", head: true }).eq("status", "finished"),
      supabase
        .from("tickets")
        .select("*", { count: "exact", head: true })
        .eq("status", "not_received")
        .lte("created_at", thresholdIso),
    ]);

    const err = totalRes.error || receivedRes.error || finishedRes.error || lateRes.error;
    if (err) {
      toast.error(arabicErrorMessage(err.message));
      return;
    }
    setTicketStats({
      total: totalRes.count ?? 0,
      inProgress: receivedRes.count ?? 0,
      completed: finishedRes.count ?? 0,
      latePickup: lateRes.count ?? 0,
    });
  }, [nowTs]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const next = Date.now();
      setNowTs(next);
      void loadTicketStats(next);
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [loadTicketStats]);

  const loadLatestChatsForTickets = async (ticketIds: string[]) => {
    if (ticketIds.length === 0) {
      setLatestChatMap({});
      return;
    }

    const { data, error } = await supabase
      .from("ticket_chats")
      .select("ticket_id, sent_at")
      .in("ticket_id", ticketIds)
      .order("sent_at", { ascending: false });

    if (error) {
      return;
    }

    const map: Record<string, string> = {};
    ((data as TicketChatRow[]) ?? []).forEach((row) => {
      if (!map[row.ticket_id]) {
        map[row.ticket_id] = row.sent_at;
      }
    });
    setLatestChatMap(map);
  };

  const loadPage = async () => {
    const from = (currentPage - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabase
      .from("tickets")
      .select("id, ticket_number, external_ticket_number, reporter_name, reporter_phone, title, category_id, ticket_categories(name), location, description, latitude, longitude, status, assigned_engineer_id, assigned_supervisor_id, assigned_technician_id, zone_id, created_at, closed_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (zoneFilter !== "all") {
      query = query.eq("zone_id", zoneFilter);
    }

    if (statusFilter !== "all") {
      query = query.eq("status", statusFilter);
    }
    if (statFilter === "late_pickup") {
      query = query
        .eq("status", "not_received")
        .lte("created_at", new Date(nowTs - PICKUP_SLACK_MINUTES * 60 * 1000).toISOString());
    } else if (statFilter === "received") {
      query = query.eq("status", "received");
    } else if (statFilter === "finished") {
      query = query.eq("status", "finished");
    }

    const q = searchTerm.trim();
    if (q) {
      const matchedZoneIds = zones.filter((zone) => zone.name.toLowerCase().includes(q.toLowerCase())).map((zone) => zone.id);
      const { data: catRows } = await supabase.from("ticket_categories").select("id").ilike("name", `%${q}%`);
      const matchedCategoryIds = (catRows ?? []).map((r) => r.id as number);

      const orParts = [
        `external_ticket_number.ilike.%${q}%`,
        `ticket_number.ilike.%${q}%`,
      ];
      if (matchedZoneIds.length > 0) {
        orParts.push(`zone_id.in.(${matchedZoneIds.join(",")})`);
      }
      if (matchedCategoryIds.length > 0) {
        orParts.push(`category_id.in.(${Array.from(new Set(matchedCategoryIds)).join(",")})`);
      }
      query = query.or(orParts.join(","));
    }

    const { data, error, count } = await query;

    if (error) {
      toast.error(arabicErrorMessage(error.message));
      return;
    }

    const rowsRaw = (data as TicketRow[]) ?? [];
    const rows = isReporterDesk ? sortReporterTickets(rowsRaw, nowTs) : rowsRaw;
    setPageTickets(rows);
    setTotalCount(count ?? 0);
    await loadLatestChatsForTickets(rows.map((ticket) => ticket.id));
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([loadZones(), loadTicketStats()]);
      await loadPage();
      setLoading(false);
    };

    void init();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [zoneFilter, statusFilter, statFilter, searchTerm]);

  useEffect(() => {
    void loadPage();
  }, [zoneFilter, statusFilter, statFilter, searchTerm, currentPage, nowTs]);

  const openTicketModal = async (ticket: TicketRow) => {
    setSelectedTicket(ticket);
    setDetailModalOpen(true);
    setDetailLoading(true);
    setLastReadMap((prev) => ({ ...prev, [ticket.id]: new Date().toISOString() }));
    const [ticketRes, attachmentsRes, staffRes] = await Promise.all([
      supabase
        .from("tickets")
        .select("id, ticket_number, external_ticket_number, reporter_name, reporter_phone, title, category_id, ticket_categories(name), location, description, latitude, longitude, status, assigned_engineer_id, assigned_supervisor_id, assigned_technician_id, zone_id, created_at, closed_at")
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
      setSelectedTicket(ticketRes.data as TicketRow);
    }
    setDetailAttachments((attachmentsRes.data as TicketAttachmentRow[]) ?? []);
    const ticketData = (ticketRes.data as TicketRow | null) ?? ticket;
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
    const isTopLevel = role === "admin" || role === "projects_director";
    const isProjectManager = role === "project_manager";
    const ticketSpecialty = mapCategoryToSpecialty(normalizeCategoryName(ticketData.ticket_categories));

    let profileIds: string[] = [];
    if (!isTopLevel && !isProjectManager) {
      if (!ticketData.zone_id) {
        setModalSupervisorOptions([]);
        setModalTechnicianOptions([]);
      } else {
        const { data: zoneLinks } = await supabase.from("zone_profiles").select("profile_id").eq("zone_id", ticketData.zone_id);
        profileIds = (zoneLinks ?? []).map((row) => row.profile_id as string);
      }
    }

    let supervisorsQuery = supabase
      .from("profiles")
      .select("id, full_name")
      .eq("role", "supervisor")
      .or("availability_status.eq.available,availability_status.is.null")
      .order("full_name");
    if (!isTopLevel && !isProjectManager) {
      if (profileIds.length === 0) {
        setModalSupervisorOptions([]);
      } else {
        supervisorsQuery = supervisorsQuery.in("id", profileIds);
        const { data: supervisors } = await supervisorsQuery;
        setModalSupervisorOptions(
          ((supervisors as AssignableProfileRow[]) ?? []).map((row) => ({ staff_id: row.id, full_name: row.full_name })),
        );
      }
    } else {
      const { data: supervisors } = await supervisorsQuery;
      setModalSupervisorOptions(
        ((supervisors as AssignableProfileRow[]) ?? []).map((row) => ({ staff_id: row.id, full_name: row.full_name })),
      );
    }

    let techQuery = supabase
      .from("profiles")
      .select("id, full_name, specialty")
      .eq("role", "technician")
      .or("availability_status.eq.available,availability_status.is.null")
      .order("full_name");
    if (!isTopLevel && !isProjectManager) {
      if (profileIds.length === 0) {
        setModalTechnicianOptions([]);
      } else {
        techQuery = techQuery.in("id", profileIds);
        if (ticketSpecialty) techQuery = techQuery.eq("specialty", ticketSpecialty);
        const { data: technicians } = await techQuery;
        setModalTechnicianOptions(
          ((technicians as AssignableProfileRow[]) ?? []).map((row) => ({ staff_id: row.id, full_name: row.full_name })),
        );
      }
    } else {
      if (ticketSpecialty) techQuery = techQuery.eq("specialty", ticketSpecialty);
      const { data: technicians } = await techQuery;
      setModalTechnicianOptions(
        ((technicians as AssignableProfileRow[]) ?? []).map((row) => ({ staff_id: row.id, full_name: row.full_name })),
      );
    }
    setModalSupervisorPick(ticketData.assigned_supervisor_id ?? "");
    setModalTechnicianPick(ticketData.assigned_technician_id ?? "");
    setDetailLoading(false);
    toast.success("تم فتح تفاصيل البلاغ.");
  };

  const saveModalSupervisor = async () => {
    if (!selectedTicket) return;
    setModalDispatching(true);
    const supId = modalSupervisorPick || null;
    const nextStatus = selectedTicket.status === "not_received" && supId ? "received" : selectedTicket.status;
    const { error } = await supabase
      .from("tickets")
      .update({ assigned_supervisor_id: supId, status: nextStatus })
      .eq("id", selectedTicket.id);
    setModalDispatching(false);
    if (error) {
      toast.error(arabicErrorMessage(error.message));
      return;
    }
    if (supId && myUserId) {
      const actor = modalSupervisorOptions.find((o) => o.staff_id === myUserId)?.full_name ?? "المهندس";
      const selectedName = modalSupervisorOptions.find((o) => o.staff_id === supId)?.full_name ?? "مراقب";
      const nowLabel = formatSaudiTime(Date.now());
      await supabase.from("ticket_messages").insert({
        ticket_id: selectedTicket.id,
        sender_id: myUserId,
        content: `تكليفات: ${actor} عيّن المراقب ${selectedName} - الساعة ${nowLabel}.`,
      });
    }
    toast.success(supId ? "تم تعيين المشرف." : "تم إلغاء تعيين المشرف.");
    await refreshAfterDetailAction();
  };

  const saveModalTechnician = async () => {
    if (!selectedTicket) return;
    setModalDispatching(true);
    const techId = modalTechnicianPick || null;
    const nextStatus = selectedTicket.status === "not_received" && techId ? "received" : selectedTicket.status;
    const { error } = await supabase
      .from("tickets")
      .update({ assigned_technician_id: techId, status: nextStatus })
      .eq("id", selectedTicket.id);
    setModalDispatching(false);
    if (error) {
      toast.error(arabicErrorMessage(error.message));
      return;
    }
    if (techId && myUserId) {
      const actor = modalSupervisorOptions.find((o) => o.staff_id === myUserId)?.full_name ?? "المشرف";
      const selectedName = modalTechnicianOptions.find((o) => o.staff_id === techId)?.full_name ?? "فني";
      const nowLabel = formatSaudiTime(Date.now());
      await supabase.from("ticket_messages").insert({
        ticket_id: selectedTicket.id,
        sender_id: myUserId,
        content: `تكليفات: ${actor} عيّن الفني ${selectedName} - الساعة ${nowLabel}.`,
      });
    }
    toast.success(techId ? "تم تكليف الفني." : "تم إلغاء تكليف الفني.");
    await refreshAfterDetailAction();
  };

  const openTicketById = async (ticketId: string) => {
    const { data, error } = await supabase
      .from("tickets")
      .select("id, ticket_number, external_ticket_number, reporter_name, reporter_phone, title, category_id, ticket_categories(name), location, description, latitude, longitude, status, assigned_engineer_id, assigned_supervisor_id, assigned_technician_id, zone_id, created_at, closed_at")
      .eq("id", ticketId)
      .single();

    if (error || !data) {
      toast.error("تعذر فتح تفاصيل البلاغ.");
      return;
    }

    await openTicketModal(data as TicketRow);
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
    await Promise.all([loadTicketStats(), loadPage()]);
    if (selectedTicket) {
      const { data } = await supabase
        .from("tickets")
        .select("id, ticket_number, external_ticket_number, reporter_name, reporter_phone, title, category_id, ticket_categories(name), location, description, latitude, longitude, status, assigned_engineer_id, assigned_supervisor_id, assigned_technician_id, zone_id, created_at, closed_at")
        .eq("id", selectedTicket.id)
        .single();

      if (data) {
        setSelectedTicket(data as TicketRow);
        setModalSupervisorPick(data.assigned_supervisor_id ?? "");
        setModalTechnicianPick(data.assigned_technician_id ?? "");
      }
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
          void loadTicketStats();
          void loadPage();
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "tickets" },
        async (payload) => {
          const updated = payload.new as TicketRow;
          setPageTickets((prev) => prev.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)));
          if (selectedTicket?.id === updated.id) {
            setSelectedTicket((prev) => (prev ? { ...prev, ...updated } : prev));
            setModalSupervisorPick(updated.assigned_supervisor_id ?? "");
            setModalTechnicianPick(updated.assigned_technician_id ?? "");
          }
          await Promise.all([loadTicketStats(), loadPage()]);
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
  }, [selectedTicket?.id]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const zoneMap = useMemo(() => {
    const map = new Map<string, Zone>();
    zones.forEach((zone) => map.set(zone.id, zone));
    return map;
  }, [zones]);

  const canSetSupervisorInModal = ["engineer", "admin", "project_manager", "projects_director"].includes(role);
  const canSetTechnicianInModal = ["admin", "project_manager", "projects_director", "supervisor"].includes(role);
  const canPostChatInModal = [
    "engineer",
    "supervisor",
    "technician",
    "admin",
    "project_manager",
    "projects_director",
  ].includes(role);

  const exportCurrentView = () => {
    const headers = ["رقم البلاغ", "التصنيف", "المنطقة", "مقدم البلاغ", "الوصف", "الحالة", "العمر الزمني"];
    const rows = pageTickets.map((ticket) => [
      String(ticket.external_ticket_number || ticket.ticket_number || ticket.id.slice(0, 8)),
      normalizeCategoryName(ticket.ticket_categories),
      ticket.zone_id ? zoneNameMap.get(ticket.zone_id) ?? "-" : "-",
      ticket.reporter_name || "-",
      (ticket.description || ticket.title || ticket.location || "-").replace(/\r?\n/g, " "),
      statusLabelAr(ticket.status),
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

  const refreshByPull = async () => {
    if (pullRefreshing) return;
    setPullRefreshing(true);
    await Promise.all([loadTicketStats(), loadPage()]);
    setPullRefreshing(false);
    toast.success("تم تحديث البيانات.");
  };

  const handleTouchStart: TouchEventHandler<HTMLDivElement> = (event) => {
    if (window.scrollY > 0) return;
    setPullStartY(event.touches[0]?.clientY ?? null);
  };

  const handleTouchMove: TouchEventHandler<HTMLDivElement> = (event) => {
    if (pullStartY === null || pullRefreshing) return;
    const currentY = event.touches[0]?.clientY ?? pullStartY;
    const delta = Math.max(0, currentY - pullStartY);
    setPullDistance(Math.min(100, delta));
  };

  const handleTouchEnd: TouchEventHandler<HTMLDivElement> = () => {
    const shouldRefresh = pullDistance >= 70;
    setPullStartY(null);
    setPullDistance(0);
    if (shouldRefresh) {
      void refreshByPull();
    }
  };

  return (
    <div
      className="relative space-y-6 bg-white text-slate-900"
      dir="rtl"
      lang="ar"
      style={{ colorScheme: "light" }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div className="sticky top-2 z-20 flex justify-center">
        <div className="rounded-full bg-white/90 px-3 py-1 text-xs text-slate-600 shadow-sm">
          {pullRefreshing ? "جاري التحديث..." : pullDistance > 35 ? "افلت للتحديث" : "اسحب للتحديث"}
        </div>
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

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <button type="button" className="text-right" onClick={() => setStatFilter("all")}>
          <Card className={statFilter === "all" ? "ring-2 ring-sky-500" : ""}>
            <CardHeader>
              <CardTitle className="text-base md:text-lg">إجمالي البلاغات</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-sky-700 md:text-3xl">{ticketStats.total}</p>
            </CardContent>
          </Card>
        </button>
        <button
          type="button"
          className="text-right"
          onClick={() => setStatFilter((prev) => (prev === "late_pickup" ? "all" : "late_pickup"))}
        >
          <Card className={statFilter === "late_pickup" ? "ring-2 ring-amber-400" : ""}>
            <CardHeader>
              <CardTitle className="text-base md:text-lg">بلاغات متأخرة الاستلام</CardTitle>
              <p className="text-xs font-normal text-slate-500">أكثر من دقيقتين ولم يُستلم بعد</p>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-amber-700 md:text-3xl">{ticketStats.latePickup}</p>
            </CardContent>
          </Card>
        </button>
        <button
          type="button"
          className="text-right"
          onClick={() => setStatFilter((prev) => (prev === "received" ? "all" : "received"))}
        >
          <Card className={statFilter === "received" ? "ring-2 ring-amber-400" : ""}>
            <CardHeader>
              <CardTitle className="text-base md:text-lg">بلاغات قيد التنفيذ</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-amber-600 md:text-3xl">{ticketStats.inProgress}</p>
            </CardContent>
          </Card>
        </button>
        <button
          type="button"
          className="text-right"
          onClick={() => setStatFilter((prev) => (prev === "finished" ? "all" : "finished"))}
        >
          <Card className={statFilter === "finished" ? "ring-2 ring-emerald-500" : ""}>
            <CardHeader>
              <CardTitle className="text-base md:text-lg">بلاغات مكتملة</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-emerald-600 md:text-3xl">{ticketStats.completed}</p>
            </CardContent>
          </Card>
        </button>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">جدول البلاغات الحالية</h2>
          <p className="text-xs text-slate-500">يعرض أحدث البلاغات مع فلاتر مباشرة</p>
        </div>

        <div className="mb-4 grid gap-3 sm:grid-cols-4">
          <div>
            <p className="mb-2 text-sm font-medium">المنطقة</p>
            <select
              className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
              value={zoneFilter}
              onChange={(e) => setZoneFilter(e.target.value)}
            >
              <option value="all">كل المناطق</option>
              {zones.map((zone) => (
                <option key={zone.id} value={zone.id}>{zone.name}</option>
              ))}
            </select>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">الحالة</p>
            <select
              className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">كل الحالات</option>
              <option value="not_received">لم يستلم</option>
              <option value="received">تم الاستلام</option>
              <option value="finished">تم الانتهاء</option>
            </select>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">بحث سريع</p>
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="ابحث برقم البلاغ أو المنطقة أو التصنيف"
            />
          </div>
          <div className="flex items-end">
            <Button variant="outline" className="w-full" onClick={exportCurrentView}>
              تصدير جدول بيانات
            </Button>
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
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-block h-2.5 w-2.5 rounded-full ${statusDotClass(ticket.status)}`}
                          />
                          <Badge variant={statusBadgeVariant(ticket.status)}>{statusLabelAr(ticket.status)}</Badge>
                          {hasUnread ? <span className="h-2.5 w-2.5 rounded-full bg-sky-500" /> : null}
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
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
            >
              السابق
            </button>
            <button
              className="min-h-11 rounded-md border border-slate-200 px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
            >
              التالي
            </button>
          </div>
        </div>
      </section>

      {createModalOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-4" onClick={() => setCreateModalOpen(false)}>
          <div
            className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 text-slate-900 shadow-2xl"
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
                await Promise.all([loadTicketStats(), loadPage()]);
                toast.success("تم حفظ البلاغ وتحديث الجدول.");
              }}
            />
          </div>
        </div>
      ) : null}

      {detailModalOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-4" onClick={() => setDetailModalOpen(false)}>
          <div
            className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 text-slate-900 shadow-2xl"
            style={{ colorScheme: "light" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">تفاصيل البلاغ</h3>
              <button
                type="button"
                className="rounded-md border border-slate-200 px-3 py-1 text-sm"
                onClick={() => setDetailModalOpen(false)}
              >
                إغلاق
              </button>
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
                  </div>
                  <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div>
                      <p className="mb-1 font-semibold">الوصف</p>
                      <p className="rounded-md bg-white p-3">{selectedTicket.description || "-"}</p>
                    </div>
                  </div>
                </div>

                {canSetSupervisorInModal ? (
                  <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
                    <p className="mb-2 text-sm font-semibold text-indigo-900">توجيه هرمي — تعيين المشرف</p>
                    <select
                      className="mb-2 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                      value={modalSupervisorPick}
                      onChange={(e) => setModalSupervisorPick(e.target.value)}
                    >
                      <option value="">— بدون —</option>
                      {modalSupervisorOptions.map((o) => (
                        <option key={o.staff_id} value={o.staff_id}>
                          {o.full_name}
                        </option>
                      ))}
                    </select>
                    <Button className="w-full sm:w-auto" disabled={modalDispatching} onClick={() => void saveModalSupervisor()}>
                      {modalDispatching ? "جاري الحفظ..." : "حفظ المشرف"}
                    </Button>
                  </div>
                ) : null}

                {canSetTechnicianInModal ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
                    <p className="mb-2 text-sm font-semibold text-emerald-900">توجيه هرمي — تكليف الفني (إدارة)</p>
                    <select
                      className="mb-2 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                      value={modalTechnicianPick}
                      onChange={(e) => setModalTechnicianPick(e.target.value)}
                    >
                      <option value="">— بدون —</option>
                      {modalTechnicianOptions.map((o) => (
                        <option key={o.staff_id} value={o.staff_id}>
                          {o.full_name}
                        </option>
                      ))}
                    </select>
                    <Button
                      className="w-full sm:w-auto"
                      variant="outline"
                      disabled={modalDispatching}
                      onClick={() => void saveModalTechnician()}
                    >
                      {modalDispatching ? "جاري الحفظ..." : "حفظ الفني"}
                    </Button>
                  </div>
                ) : null}

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
                              <video src={att.file_url} className="h-36 w-full object-cover" controls muted playsInline />
                            ) : (
                              <img src={att.file_url} alt={att.file_name ?? "مرفق"} className="h-36 w-full object-cover" />
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
    </div>
  );
}