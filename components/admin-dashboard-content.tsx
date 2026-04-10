"use client";

import { useEffect, useMemo, useState, type TouchEventHandler } from "react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TicketCreateForm } from "@/components/ticket-create-form";
import { TicketChatPanel } from "@/components/ticket-chat-panel";

type Zone = {
  id: string;
  name: string;
  center_latitude?: number | null;
  center_longitude?: number | null;
  latitude?: number | null;
  longitude?: number | null;
};

type TicketStatus = "new" | "assigned" | "on_the_way" | "arrived" | "fixed";
type StatFilter = "all" | "active" | "pending" | "completed" | "overdue";
type CategoryJoin = { name: string } | { name: string }[] | null;

type TicketRow = {
  id: string;
  ticket_number?: number | null;
  external_ticket_number?: string | null;
  reporter_name?: string | null;
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
};

type TicketAttachmentRow = {
  id: string;
  file_url: string;
  file_type: string;
  created_at: string;
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

const IN_PROGRESS_STATUSES: TicketStatus[] = ["assigned", "on_the_way", "arrived"];
const PAGE_SIZE = 10;
const LAST_READ_STORAGE_KEY = "admin_ticket_last_read_map";
const OVERDUE_HOURS = 4;
const ONLINE_WINDOW_MS = 2 * 60 * 1000;
const NEARBY_RADIUS_METERS = 3000;

const TicketDetailLiveMap = dynamic(
  () => import("@/components/ticket-detail-live-map").then((m) => m.TicketDetailLiveMap),
  {
    ssr: false,
    loading: () => (
      <div className="h-72 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
    ),
  },
);

function statusBadgeVariant(status: TicketStatus): "red" | "yellow" | "green" | "muted" {
  if (status === "new") return "red";
  if (status === "on_the_way") return "yellow";
  if (status === "fixed") return "green";
  return "muted";
}

function categoryBadgeColor(categoryName: string): string {
  const lower = categoryName.toLowerCase();
  if (lower.includes("حريق") || lower.includes("fire")) return "bg-red-100 text-red-700 border-red-200";
  if (lower.includes("كهرباء") || lower.includes("electric")) return "bg-amber-100 text-amber-700 border-amber-200";
  if (lower.includes("تكييف") || lower.includes("ac")) return "bg-sky-100 text-sky-700 border-sky-200";
  if (lower.includes("مدني") || lower.includes("civil")) return "bg-stone-100 text-stone-700 border-stone-200";
  if (lower.includes("مطابخ") || lower.includes("kitchen")) return "bg-violet-100 text-violet-700 border-violet-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

function relativeAgeLabel(createdAt: string, nowTs: number): string {
  const deltaMs = Math.max(0, nowTs - new Date(createdAt).getTime());
  const minutes = Math.floor(deltaMs / 60_000);
  if (minutes < 1) return "الآن";
  if (minutes < 60) return `منذ ${minutes} دقيقة`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `منذ ${hours} ساعة`;
  const days = Math.floor(hours / 24);
  return `منذ ${days} يوم`;
}

function normalizeCategoryName(category: CategoryJoin | undefined): string {
  if (!category) return "-";
  if (Array.isArray(category)) return category[0]?.name ?? "-";
  return category.name;
}

function statusText(status: TicketStatus): string {
  if (status === "new") return "جديد";
  if (status === "assigned") return "تم التعيين";
  if (status === "on_the_way") return "في الطريق";
  if (status === "arrived") return "وصل";
  return "مغلق";
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
  const [allTickets, setAllTickets] = useState<TicketRow[]>([]);
  const [pageTickets, setPageTickets] = useState<TicketRow[]>([]);
  const [zoneFilter, setZoneFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [statFilter, setStatFilter] = useState<StatFilter>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
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

  useEffect(() => {
    const timer = window.setInterval(() => setNowTs(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const loadZones = async () => {
    const { data, error } = await supabase
      .from("zones")
      .select("id, name, center_latitude, center_longitude, latitude, longitude")
      .order("name");
    if (error) {
      toast.error(error.message);
      return;
    }
    setZones(data ?? []);
  };

  const loadStats = async () => {
    const { data, error } = await supabase
      .from("tickets")
      .select("id, ticket_number, external_ticket_number, reporter_name, title, category_id, ticket_categories(name), shaqes_notes, location, description, latitude, longitude, status, assigned_engineer_id, assigned_supervisor_id, assigned_technician_id, zone_id, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error(error.message);
      return;
    }

    setAllTickets((data as TicketRow[]) ?? []);
  };

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
      .select("id, ticket_number, external_ticket_number, reporter_name, title, category_id, ticket_categories(name), shaqes_notes, location, description, latitude, longitude, status, assigned_engineer_id, assigned_supervisor_id, assigned_technician_id, zone_id, created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (zoneFilter !== "all") {
      query = query.eq("zone_id", zoneFilter);
    }

    if (statusFilter !== "all") {
      query = query.eq("status", statusFilter);
    }
    if (statFilter === "active") {
      query = query.in("status", IN_PROGRESS_STATUSES);
    } else if (statFilter === "pending") {
      query = query.eq("status", "new");
    } else if (statFilter === "completed") {
      query = query.eq("status", "fixed");
    } else if (statFilter === "overdue") {
      const overdueCutoff = new Date(nowTs - OVERDUE_HOURS * 60 * 60 * 1000).toISOString();
      query = query.neq("status", "fixed").lt("created_at", overdueCutoff);
    }

    const q = searchTerm.trim();
    if (q) {
      const matchedZoneIds = zones.filter((zone) => zone.name.toLowerCase().includes(q.toLowerCase())).map((zone) => zone.id);
      const matchedCategoryIds = allTickets
        .filter((ticket) => normalizeCategoryName(ticket.ticket_categories).toLowerCase().includes(q.toLowerCase()))
        .map((ticket) => ticket.category_id)
        .filter((value): value is number => typeof value === "number");

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
      toast.error(error.message);
      return;
    }

    const rows = (data as TicketRow[]) ?? [];
    setPageTickets(rows);
    setTotalCount(count ?? 0);
    await loadLatestChatsForTickets(rows.map((ticket) => ticket.id));
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([loadZones(), loadStats()]);
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
  }, [zoneFilter, statusFilter, statFilter, searchTerm, currentPage]);

  const openTicketModal = async (ticket: TicketRow) => {
    setSelectedTicket(ticket);
    setDetailModalOpen(true);
    setDetailLoading(true);
    setLastReadMap((prev) => ({ ...prev, [ticket.id]: new Date().toISOString() }));
    const [ticketRes, attachmentsRes, staffRes] = await Promise.all([
      supabase
        .from("tickets")
        .select("id, ticket_number, external_ticket_number, reporter_name, title, category_id, ticket_categories(name), shaqes_notes, location, description, latitude, longitude, status, assigned_engineer_id, assigned_supervisor_id, assigned_technician_id, zone_id, created_at")
        .eq("id", ticket.id)
        .single(),
      supabase
        .from("ticket_attachments")
        .select("id, file_url, file_type, created_at")
        .eq("ticket_id", ticket.id)
        .order("created_at", { ascending: false }),
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
    if (ticketData.zone_id) {
      const ticketSpecialty = mapCategoryToSpecialty(normalizeCategoryName(ticketData.ticket_categories));
      const { data: zoneLinks } = await supabase.from("zone_profiles").select("profile_id").eq("zone_id", ticketData.zone_id);
      const profileIds = (zoneLinks ?? []).map((row) => row.profile_id as string);
      if (profileIds.length > 0) {
        const { data: supervisors } = await supabase
          .from("profiles")
          .select("id, full_name")
          .eq("role", "supervisor")
          .or("availability_status.eq.available,availability_status.is.null")
          .in("id", profileIds)
          .order("full_name");
        setModalSupervisorOptions(
          ((supervisors as AssignableProfileRow[]) ?? []).map((row) => ({ staff_id: row.id, full_name: row.full_name })),
        );
        let techQuery = supabase
          .from("profiles")
          .select("id, full_name, specialty")
          .eq("role", "technician")
          .or("availability_status.eq.available,availability_status.is.null")
          .in("id", profileIds)
          .order("full_name");
        if (ticketSpecialty) techQuery = techQuery.eq("specialty", ticketSpecialty);
        const { data: technicians } = await techQuery;
        setModalTechnicianOptions(
          ((technicians as AssignableProfileRow[]) ?? []).map((row) => ({ staff_id: row.id, full_name: row.full_name })),
        );
      } else {
        setModalSupervisorOptions([]);
        setModalTechnicianOptions([]);
      }
    } else {
      setModalSupervisorOptions([]);
      setModalTechnicianOptions([]);
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
    const nextStatus = selectedTicket.status === "new" && supId ? "assigned" : selectedTicket.status;
    const { error } = await supabase
      .from("tickets")
      .update({ assigned_supervisor_id: supId, status: nextStatus })
      .eq("id", selectedTicket.id);
    setModalDispatching(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (supId && myUserId) {
      const actor = modalSupervisorOptions.find((o) => o.staff_id === myUserId)?.full_name ?? "المهندس";
      const selectedName = modalSupervisorOptions.find((o) => o.staff_id === supId)?.full_name ?? "مراقب";
      const nowLabel = new Date().toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" });
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
    const nextStatus = selectedTicket.status === "new" && techId ? "assigned" : selectedTicket.status;
    const { error } = await supabase
      .from("tickets")
      .update({ assigned_technician_id: techId, status: nextStatus })
      .eq("id", selectedTicket.id);
    setModalDispatching(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (techId && myUserId) {
      const actor = modalSupervisorOptions.find((o) => o.staff_id === myUserId)?.full_name ?? "المشرف";
      const selectedName = modalTechnicianOptions.find((o) => o.staff_id === techId)?.full_name ?? "فني";
      const nowLabel = new Date().toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" });
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
      .select("id, ticket_number, external_ticket_number, reporter_name, title, category_id, ticket_categories(name), shaqes_notes, location, description, latitude, longitude, status, assigned_engineer_id, assigned_supervisor_id, assigned_technician_id, zone_id, created_at")
      .eq("id", ticketId)
      .single();

    if (error || !data) {
      toast.error("Unable to open ticket details.");
      return;
    }

    await openTicketModal(data as TicketRow);
  };

  const refreshAfterDetailAction = async () => {
    await Promise.all([loadStats(), loadPage()]);
    if (selectedTicket) {
      const { data } = await supabase
        .from("tickets")
        .select("id, ticket_number, external_ticket_number, reporter_name, title, category_id, ticket_categories(name), shaqes_notes, location, description, latitude, longitude, status, assigned_engineer_id, assigned_supervisor_id, assigned_technician_id, zone_id, created_at")
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
          toast.success(`New ticket: ${newTicket.location}`, {
            action: {
              label: "Open",
              onClick: () => {
                void openTicketById(newTicket.id);
              },
            },
          });
          void loadStats();
          void loadPage();
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "tickets" },
        async (payload) => {
          const updated = payload.new as TicketRow;
          setPageTickets((prev) => prev.map((t) => (t.id === updated.id ? { ...t, status: updated.status } : t)));
          if (selectedTicket?.id === updated.id) {
            setSelectedTicket((prev) => (prev ? { ...prev, ...updated } : prev));
            setModalSupervisorPick(updated.assigned_supervisor_id ?? "");
            setModalTechnicianPick(updated.assigned_technician_id ?? "");
          }
          await Promise.all([loadStats(), loadPage(), refreshAfterDetailAction()]);
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

  useEffect(() => {
    if (statFilter !== "overdue") return;
    void loadPage();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: avoid loadPage identity churn
  }, [nowTs, statFilter]);

  const stats = useMemo(() => {
    const active = allTickets.filter((t) => IN_PROGRESS_STATUSES.includes(t.status)).length;
    const pending = allTickets.filter((t) => t.status === "new").length;
    const completed = allTickets.filter((t) => t.status === "fixed").length;
    const overdue = allTickets.filter((t) => {
      if (t.status === "fixed") return false;
      const createdMs = new Date(t.created_at).getTime();
      return nowTs - createdMs > OVERDUE_HOURS * 60 * 60 * 1000;
    }).length;
    return { active, pending, completed, overdue };
  }, [allTickets, nowTs]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const zoneMap = useMemo(() => {
    const map = new Map<string, Zone>();
    zones.forEach((zone) => map.set(zone.id, zone));
    return map;
  }, [zones]);

  const canSetSupervisorInModal = ["engineer", "admin", "project_manager", "projects_director"].includes(role);
  const canSetTechnicianInModal = ["admin", "project_manager", "projects_director"].includes(role);
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
      statusText(ticket.status),
      relativeAgeLabel(ticket.created_at, nowTs),
    ]);
    const csv = [headers, ...rows]
      .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tickets-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("تم تصدير البلاغات المعروضة بنجاح.");
  };

  const refreshByPull = async () => {
    if (pullRefreshing) return;
    setPullRefreshing(true);
    await Promise.all([loadStats(), loadPage()]);
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
      className="relative space-y-6"
      dir="rtl"
      lang="ar"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div className="sticky top-2 z-20 flex justify-center">
        <div className="rounded-full bg-white/90 px-3 py-1 text-xs text-slate-600 shadow-sm">
          {pullRefreshing ? "جاري التحديث..." : pullDistance > 35 ? "افلت للتحديث" : "اسحب للتحديث"}
        </div>
      </div>
      {!tableOnly ? (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <button type="button" className="text-right" onClick={() => setStatFilter((prev) => (prev === "active" ? "all" : "active"))}>
            <Card className={statFilter === "active" ? "ring-2 ring-sky-500" : ""}><CardHeader><CardTitle>البلاغات النشطة (Active)</CardTitle></CardHeader><CardContent><p className="text-3xl font-semibold text-sky-700">{stats.active}</p></CardContent></Card>
          </button>
          <button type="button" className="text-right" onClick={() => setStatFilter((prev) => (prev === "pending" ? "all" : "pending"))}>
            <Card className={statFilter === "pending" ? "ring-2 ring-amber-500" : ""}><CardHeader><CardTitle>البلاغات المعلقة (Pending)</CardTitle></CardHeader><CardContent><p className="text-3xl font-semibold text-amber-600">{stats.pending}</p></CardContent></Card>
          </button>
          <button type="button" className="text-right" onClick={() => setStatFilter((prev) => (prev === "completed" ? "all" : "completed"))}>
            <Card className={statFilter === "completed" ? "ring-2 ring-green-500" : ""}><CardHeader><CardTitle>البلاغات المنتهية (Completed)</CardTitle></CardHeader><CardContent><p className="text-3xl font-semibold text-green-600">{stats.completed}</p></CardContent></Card>
          </button>
          <button type="button" className="text-right" onClick={() => setStatFilter((prev) => (prev === "overdue" ? "all" : "overdue"))}>
            <Card className={statFilter === "overdue" ? "ring-2 ring-red-500" : ""}><CardHeader><CardTitle>البلاغات المتأخرة (Overdue)</CardTitle></CardHeader><CardContent><p className="text-3xl font-semibold text-red-600">{stats.overdue}</p></CardContent></Card>
          </button>
        </section>
      ) : null}

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
              <option value="new">جديد</option>
              <option value="assigned">تم التعيين</option>
              <option value="on_the_way">في الطريق</option>
              <option value="arrived">وصل</option>
              <option value="fixed">مغلق</option>
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
              تصدير Excel
            </Button>
          </div>
        </div>

        <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          عرض {pageTickets.length} بلاغ من {totalCount} بعد الفلترة (الإجمالي العام: {allTickets.length})
        </div>

        <p className="mb-2 text-xs text-slate-500">مرتبة من الأحدث إلى الأقدم</p>

        {loading ? (
          <p className="text-sm text-slate-500">Loading tickets...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
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
                            className={`inline-block h-2.5 w-2.5 rounded-full ${
                              ticket.status === "fixed" ? "bg-green-500" : ticket.status === "new" ? "bg-red-500" : "bg-amber-500"
                            }`}
                          />
                          <Badge variant={statusBadgeVariant(ticket.status)}>{ticket.status}</Badge>
                          {hasUnread ? <span className="h-2.5 w-2.5 rounded-full bg-sky-500" /> : null}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-600">{relativeAgeLabel(ticket.created_at, nowTs)}</td>
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
        )}

        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-slate-500">الصفحة {currentPage} من {totalPages}</p>
          <div className="flex items-center gap-2">
            <button
              className="rounded-md border border-slate-200 px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
            >
              السابق
            </button>
            <button
              className="rounded-md border border-slate-200 px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
            >
              التالي
            </button>
          </div>
        </div>
      </section>

      <Button
        className="fixed bottom-8 left-8 z-30 h-12 rounded-full px-5 text-base shadow-lg"
        onClick={() => setCreateModalOpen(true)}
      >
        + إنشاء بلاغ جديد
      </Button>

      {createModalOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-4" onClick={() => setCreateModalOpen(false)}>
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
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
                await Promise.all([loadStats(), loadPage()]);
                toast.success("تم حفظ البلاغ وتحديث الجدول.");
              }}
            />
          </div>
        </div>
      ) : null}

      {detailModalOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-4" onClick={() => setDetailModalOpen(false)}>
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
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
                      role: profile?.role ?? "staff",
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
                    <div><span className="font-semibold">الموقع:</span> {selectedTicket.location || "-"}</div>
                    <div><span className="font-semibold">GPS:</span> {selectedTicket.latitude && selectedTicket.longitude ? `${selectedTicket.latitude}, ${selectedTicket.longitude}` : "غير متاح"}</div>
                  </div>
                  <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div>
                      <p className="mb-1 font-semibold">الوصف</p>
                      <p className="rounded-md bg-white p-3">{selectedTicket.description || "-"}</p>
                    </div>
                    <div>
                      <p className="mb-1 font-semibold">ملاحظات شاخص الفنية</p>
                      <p className="rounded-md bg-white p-3">{selectedTicket.shaqes_notes || "لا توجد ملاحظات"}</p>
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
                  <p className="mb-2 font-semibold">الصور المرفقة</p>
                  {detailAttachments.length === 0 ? (
                    <p className="text-slate-500">لا توجد مرفقات.</p>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      {detailAttachments.map((att) => (
                        <a key={att.id} href={att.file_url} target="_blank" rel="noreferrer" className="overflow-hidden rounded-lg border border-slate-200">
                          <img src={att.file_url} alt="ticket attachment" className="h-36 w-full object-cover" />
                        </a>
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