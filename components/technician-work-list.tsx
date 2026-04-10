"use client";

import { useEffect, useRef, useState, type TouchEventHandler } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";
import { TicketDetailDrawer, type TicketDetailRow } from "@/components/ticket-detail-drawer";

type TicketStatus = "new" | "assigned" | "on_the_way" | "arrived" | "fixed";

type TechnicianTicket = {
  id: string;
  ticket_number: number | null;
  external_ticket_number: string | null;
  location: string;
  description: string;
  status: TicketStatus;
  created_at: string;
  assigned_technician_id: string | null;
  assigned_supervisor_id: string | null;
  zone_id: string | null;
  ticket_categories?: { name: string } | { name: string }[] | null;
};

type MyProfile = {
  specialty?: string | null;
};

type ZoneNotificationRow = {
  id: number;
  ticket_id: string;
  title: string;
  body: string;
};

function normalizeCategoryName(category: TechnicianTicket["ticket_categories"]): string {
  if (!category) return "";
  if (Array.isArray(category)) return category[0]?.name ?? "";
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

function statusLabel(status: TicketStatus): string {
  if (status === "new") return "جديد";
  if (status === "assigned") return "مُسند";
  if (status === "on_the_way") return "في الطريق";
  if (status === "arrived") return "تم الوصول";
  return "تم الإصلاح";
}

type TechnicianWorkListProps = {
  role: "technician" | "supervisor";
};

export function TechnicianWorkList({ role }: TechnicianWorkListProps) {
  const [tickets, setTickets] = useState<TechnicianTicket[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTicket, setDrawerTicket] = useState<TicketDetailRow | null>(null);
  const [drawerZoneName, setDrawerZoneName] = useState("-");
  const drawerTicketIdRef = useRef<string | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pullStartY, setPullStartY] = useState<number | null>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [pullRefreshing, setPullRefreshing] = useState(false);

  const loadTickets = async () => {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      toast.error("انتهت الجلسة. يرجى تسجيل الدخول مرة أخرى.");
      setLoading(false);
      return;
    }
    setMyUserId(user.id);

    const res = await fetch("/api/tasks/zone-tickets", { cache: "no-store" });
    const payload = (await res.json()) as { tickets?: TechnicianTicket[]; error?: string };

    if (!res.ok) {
      toast.error(payload.error ?? "تعذر تحميل المهام.");
      setLoading(false);
      return;
    }
    const rows = payload.tickets ?? [];
    const mySpecialty = role === "technician"
      ? ((
          await supabase.from("profiles").select("specialty").eq("id", user.id).maybeSingle()
        ).data as MyProfile | null)?.specialty ?? null
      : null;
    const filtered = rows.filter((ticket) => {
      if (role !== "technician") return true;
      const ticketSpecialty = mapCategoryToSpecialty(normalizeCategoryName(ticket.ticket_categories));
      return mySpecialty ? ticketSpecialty === mySpecialty : true;
    });
    setTickets(filtered);
    setLoading(false);
  };

  const loadDrawerTicket = async (ticketId: string) => {
    const { data, error } = await supabase
      .from("tickets")
      .select(
        "id, ticket_number, external_ticket_number, title, location, description, status, assigned_engineer_id, assigned_supervisor_id, assigned_technician_id, zone_id, category_id, ticket_categories(name), created_at",
      )
      .eq("id", ticketId)
      .single();

    if (error || !data) {
      toast.error("تعذر تحميل تفاصيل البلاغ.");
      return;
    }
    const row = data as TicketDetailRow;
    if (row.assigned_engineer_id === undefined) {
      row.assigned_engineer_id = null;
    }
    setDrawerTicket(row);
    drawerTicketIdRef.current = row.id;
    if (row.zone_id) {
      const { data: z } = await supabase.from("zones").select("name").eq("id", row.zone_id).maybeSingle();
      setDrawerZoneName(z?.name ?? "-");
    } else {
      setDrawerZoneName("-");
    }
    setDrawerOpen(true);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial work list fetch
    void loadTickets();
  }, []);

  useEffect(() => {
    if (!myUserId) return;
    const channel = supabase
      .channel(`my-work-assignments-${myUserId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "tickets" },
        (payload) => {
          const oldRow = payload.old as Record<string, unknown>;
          const newRow = payload.new as Record<string, unknown>;
          if (role === "supervisor") {
            const was = oldRow.assigned_supervisor_id as string | undefined;
            const now = newRow.assigned_supervisor_id as string | undefined;
            if (was !== myUserId && now === myUserId) {
              toast.success("تم تكليفك كمشرف على بلاغ جديد.");
              void loadTickets();
            }
          } else {
            const was = oldRow.assigned_technician_id as string | undefined;
            const now = newRow.assigned_technician_id as string | undefined;
            if (was !== myUserId && now === myUserId) {
              toast.success("تم تكليفك بتنفيذ بلاغ جديد.");
              void loadTickets();
            }
          }
        },
      )
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "tickets" }, () => void loadTickets())
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "zone_notifications", filter: `recipient_id=eq.${myUserId}` },
        (payload) => {
          const row = payload.new as ZoneNotificationRow;
          toast.success(row.title);
          if ("Notification" in window && Notification.permission === "granted" && "serviceWorker" in navigator) {
            void navigator.serviceWorker.ready.then((registration) => {
              if (registration.active) {
                registration.active.postMessage({
                  type: "SHOW_NOTIFICATION",
                  title: row.title,
                  options: {
                    body: row.body,
                    data: { url: "/tasks/my-work" },
                  },
                });
              }
            });
          }
          void loadTickets();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [myUserId, role]);

  useEffect(() => {
    if (!("Notification" in window)) return;
    if (Notification.permission === "default") {
      void Notification.requestPermission();
    }
  }, []);

  const claimTicket = async (ticketId: string) => {
    const res = await fetch(`/api/tasks/zone-tickets/${ticketId}/claim`, {
      method: "PATCH",
    });
    const payload = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !payload.ok) {
      toast.error(payload.error ?? "تعذر قبول البلاغ.");
      return;
    }
    toast.success("تم قبول البلاغ وتحويله لك.");
    await loadTickets();
  };

  const refreshByPull = async () => {
    if (pullRefreshing) return;
    setPullRefreshing(true);
    await loadTickets();
    setPullRefreshing(false);
    toast.success("تم تحديث المهام.");
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
      className="space-y-4"
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
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>قائمة مهامي</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-slate-500">جاري التحميل...</p>
          ) : tickets.length === 0 ? (
            <p className="text-sm text-slate-500">
              {role === "technician"
                ? "لا توجد بلاغات مكلّفة إليك حتى يعيّنك المشرف."
                : "لا توجد بلاغات تحت إشرافك حالياً."}
            </p>
          ) : (
            <div className="space-y-2">
              {tickets.map((ticket) => (
                <div
                  key={ticket.id}
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-3 text-right text-sm transition hover:border-slate-400 hover:bg-slate-50"
                >
                  <button type="button" className="w-full text-right" onClick={() => void loadDrawerTicket(ticket.id)}>
                    <p className="font-medium">{ticket.external_ticket_number || `#${ticket.ticket_number ?? "-"}`}</p>
                    <p className="text-slate-700">{ticket.location}</p>
                    <p className="text-xs text-slate-500">الحالة: {statusLabel(ticket.status)}</p>
                  </button>
                  {role === "technician" && !ticket.assigned_technician_id ? (
                    <button
                      type="button"
                      className="mt-2 min-h-11 rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                      onClick={() => void claimTicket(ticket.id)}
                    >
                      قبول البلاغ
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <TicketDetailDrawer
        open={drawerOpen}
        onOpenChange={(open) => {
          setDrawerOpen(open);
          if (!open) {
            setDrawerTicket(null);
            drawerTicketIdRef.current = null;
          }
        }}
        ticket={drawerTicket}
        zoneName={drawerZoneName}
        onTicketUpdated={async () => {
          await loadTickets();
          const id = drawerTicketIdRef.current;
          if (id) {
            await loadDrawerTicket(id);
          }
        }}
        onMarkTicketRead={() => {}}
      />
    </div>
  );
}
