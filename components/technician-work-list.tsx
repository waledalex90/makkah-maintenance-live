"use client";

import { useEffect, useMemo, useRef, useState, type TouchEventHandler } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LogoutButton } from "@/components/logout-button";
import { supabase } from "@/lib/supabase";
import { playWorkNotificationSound } from "@/lib/work-notification";
import { TicketDetailDrawer, type TicketDetailRow } from "@/components/ticket-detail-drawer";
import { TicketReceptionCaption } from "@/components/ticket-reception-caption";
import { pushLiveLocationOnce } from "@/lib/push-live-location";
import {
  fetchZoneTicketsWorkspace,
  ZONE_TICKETS_AREA_KEY,
  ZONE_TICKETS_MINE_KEY,
  ZONE_TICKETS_QUERY_KEY,
  type TechnicianTicket,
  type ZoneJoin,
} from "@/lib/zone-tickets-query";
import { TICKET_DRAWER_WITH_HANDLER_PROFILES } from "@/lib/ticket-handler-select";
import { formatSaudiDateTime } from "@/lib/saudi-time";
import { statusLabelAr } from "@/lib/ticket-status";

type ZoneNotificationRow = {
  id: number;
  ticket_id: string;
  title: string;
  body: string;
};

type WorkTab = "area" | "mine";

function normalizeCategoryName(category: TechnicianTicket["ticket_categories"]): string {
  if (!category) return "";
  if (Array.isArray(category)) return category[0]?.name ?? "";
  return category.name;
}

function normalizeZoneName(zones: ZoneJoin | undefined): string {
  if (!zones) return "-";
  if (Array.isArray(zones)) return zones[0]?.name ?? "-";
  return zones.name ?? "-";
}

type TechnicianWorkListProps = {
  role: "technician" | "supervisor";
};

export function TechnicianWorkList({ role }: TechnicianWorkListProps) {
  const queryClient = useQueryClient();
  const zoneQuery = useQuery({
    queryKey: ZONE_TICKETS_QUERY_KEY,
    queryFn: async () => {
      const result = await fetchZoneTicketsWorkspace();
      queryClient.setQueryData(ZONE_TICKETS_AREA_KEY, result.areaTickets);
      queryClient.setQueryData(ZONE_TICKETS_MINE_KEY, result.myTickets);
      return result;
    },
    placeholderData: (previousData) => previousData,
  });

  const areaTickets = zoneQuery.data?.areaTickets ?? [];
  const myTickets = zoneQuery.data?.myTickets ?? [];
  const myUserId = zoneQuery.data?.myUserId ?? null;
  const canViewMap = zoneQuery.data?.canViewMap ?? false;

  const [tab, setTab] = useState<WorkTab>("area");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTicket, setDrawerTicket] = useState<TicketDetailRow | null>(null);
  const [drawerZoneName, setDrawerZoneName] = useState("-");
  const drawerTicketIdRef = useRef<string | null>(null);
  const [pullStartY, setPullStartY] = useState<number | null>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const seenTicketIdsRef = useRef<Set<string>>(new Set());
  const initialListHydratedRef = useRef(false);

  const visibleTickets = tab === "area" ? areaTickets : myTickets;

  const firstLoadBlocking = zoneQuery.isPending && zoneQuery.data === undefined;

  useEffect(() => {
    if (!zoneQuery.isError || !zoneQuery.error) return;
    const msg = zoneQuery.error.message;
    if (msg === "SESSION") {
      toast.error("انتهت الجلسة. يرجى تسجيل الدخول مرة أخرى.");
    } else if (msg === "FETCH") {
      toast.error("تعذر تحميل المهام.");
    } else {
      toast.error(msg);
    }
  }, [zoneQuery.isError, zoneQuery.error]);

  const loadDrawerTicket = async (ticketId: string) => {
    const { data, error } = await supabase
      .from("tickets")
      .select(TICKET_DRAWER_WITH_HANDLER_PROFILES)
      .eq("id", ticketId)
      .single();

    if (error || !data) {
      toast.error("تعذر تحميل تفاصيل البلاغ.");
      return;
    }
    const row = data as unknown as TicketDetailRow;
    if (row.assigned_engineer_id === undefined) {
      row.assigned_engineer_id = null;
    }
    setDrawerTicket(row);
    drawerTicketIdRef.current = row.id;
    const zname = normalizeZoneName((row as { zones?: ZoneJoin }).zones);
    if (zname !== "-") {
      setDrawerZoneName(zname);
    } else if (row.zone_id) {
      const { data: z } = await supabase.from("zones").select("name").eq("id", row.zone_id).maybeSingle();
      setDrawerZoneName(z?.name ?? "-");
    } else {
      setDrawerZoneName("-");
    }
    setDrawerOpen(true);
  };

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
              playWorkNotificationSound();
              toast.success("تم تكليفك كمشرف على بلاغ جديد.");
            }
          } else {
            const was = oldRow.assigned_technician_id as string | undefined;
            const now = newRow.assigned_technician_id as string | undefined;
            if (was !== myUserId && now === myUserId) {
              playWorkNotificationSound();
              toast.success("تم تكليفك بتنفيذ بلاغ جديد.");
            }
          }
          void queryClient.invalidateQueries({ queryKey: ZONE_TICKETS_QUERY_KEY });
        },
      )
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "tickets" }, () =>
        void queryClient.invalidateQueries({ queryKey: ZONE_TICKETS_QUERY_KEY }),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "zone_notifications", filter: `recipient_id=eq.${myUserId}` },
        (payload) => {
          const row = payload.new as ZoneNotificationRow;
          playWorkNotificationSound();
          toast.success(row.title);
          if ("Notification" in window && Notification.permission === "granted" && "serviceWorker" in navigator) {
            void navigator.serviceWorker.ready.then((registration) => {
              if (registration.active) {
                registration.active.postMessage({
                  type: "SHOW_NOTIFICATION",
                  title: row.title,
                  options: {
                    body: row.body,
                    data: { url: `/dashboard/tickets?ticketId=${row.ticket_id}`, ticketId: row.ticket_id },
                  },
                });
              }
            });
          }
          void queryClient.invalidateQueries({ queryKey: ZONE_TICKETS_QUERY_KEY });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [myUserId, role, queryClient]);

  useEffect(() => {
    if (!("Notification" in window)) return;
    if (Notification.permission === "default") {
      void Notification.requestPermission();
    }
  }, []);

  const combinedTickets = useMemo(() => {
    const map = new Map<string, TechnicianTicket>();
    [...myTickets, ...areaTickets].forEach((t) => map.set(t.id, t));
    return [...map.values()];
  }, [areaTickets, myTickets]);

  useEffect(() => {
    if (firstLoadBlocking) return;
    const ids = new Set(combinedTickets.map((t) => t.id));
    if (!initialListHydratedRef.current) {
      seenTicketIdsRef.current = ids;
      initialListHydratedRef.current = true;
      return;
    }
    let foundNew = false;
    for (const id of ids) {
      if (!seenTicketIdsRef.current.has(id)) {
        foundNew = true;
        break;
      }
    }
    if (foundNew) {
      playWorkNotificationSound();
    }
    seenTicketIdsRef.current = ids;
  }, [combinedTickets, firstLoadBlocking]);

  const [pendingClaimId, setPendingClaimId] = useState<string | null>(null);
  const [pendingAcceptId, setPendingAcceptId] = useState<string | null>(null);

  const claimTicket = async (ticketId: string) => {
    if (pendingClaimId || pendingAcceptId) return;
    setPendingClaimId(ticketId);
    try {
      const res = await fetch(`/api/tasks/zone-tickets/${ticketId}/claim`, {
        method: "PATCH",
      });
      const payload = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !payload.ok) {
        toast.error(payload.error ?? "تعذر قبول البلاغ.");
        return;
      }
      void pushLiveLocationOnce();
      toast.success("تم قبول البلاغ وتحويله لك.");
      await queryClient.invalidateQueries({ queryKey: ZONE_TICKETS_QUERY_KEY });
    } finally {
      setPendingClaimId(null);
    }
  };

  const acceptTicket = async (ticketId: string) => {
    if (pendingAcceptId || pendingClaimId) return;
    setPendingAcceptId(ticketId);
    try {
      const res = await fetch(`/api/tasks/zone-tickets/${ticketId}/accept`, {
        method: "PATCH",
      });
      const payload = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !payload.ok) {
        toast.error(payload.error ?? "تعذر قبول المهمة.");
        return;
      }
      void pushLiveLocationOnce();
      toast.success("تم قبول المهمة وبدء التنفيذ.");
      await queryClient.invalidateQueries({ queryKey: ZONE_TICKETS_QUERY_KEY });
    } finally {
      setPendingAcceptId(null);
    }
  };

  const refreshByPull = async () => {
    if (pullRefreshing) return;
    setPullRefreshing(true);
    await zoneQuery.refetch();
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

  const tabBtn = (id: WorkTab, label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => setTab(id)}
      className={`min-h-11 flex-1 rounded-md px-2 py-2 text-sm font-semibold transition ${
        tab === id ? "bg-slate-900 text-white shadow" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div
      className="space-y-4"
      dir="rtl"
      lang="ar"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">لوحة الميدان</p>
          <p className="text-lg font-bold text-slate-900 dark:text-slate-100">مهامي</p>
        </div>
        <LogoutButton />
      </div>
      <div className="sticky top-2 z-20 flex justify-center">
        <div className="rounded-full bg-white/90 px-3 py-1 text-xs text-slate-600 shadow-sm">
          {pullRefreshing ? "جاري التحديث..." : pullDistance > 35 ? "افلت للتحديث" : "اسحب للتحديث"}
        </div>
      </div>
      <Card className="shadow-sm">
        <CardHeader className="space-y-3 pb-2">
          <CardTitle>مهام العمل</CardTitle>
          <div className="flex gap-2">
            {tabBtn("area", "بلاغات المنطقة")}
            {tabBtn("mine", "مهامي المباشرة")}
          </div>
        </CardHeader>
        <CardContent>
          {firstLoadBlocking ? (
            <p className="text-sm text-slate-500">جاري التحميل...</p>
          ) : visibleTickets.length === 0 ? (
            <p className="text-sm text-slate-500">
              {tab === "area" ? "لا توجد بلاغات مطابقة لمنطقتك وتخصصك." : "لا توجد مهام موجهة إليك حالياً."}
            </p>
          ) : (
            <div className="space-y-2">
              {visibleTickets.map((ticket) => {
                const categoryDisplay =
                  ticket.category?.trim() || normalizeCategoryName(ticket.ticket_categories) || "-";
                const zoneDisplay = normalizeZoneName(ticket.zones);
                const numberDisplay = ticket.external_ticket_number || `#${ticket.ticket_number ?? "-"}`;
                return (
                  <div
                    key={ticket.id}
                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-3 text-right text-sm transition hover:border-slate-400 hover:bg-slate-50"
                  >
                    <button type="button" className="w-full text-right" onClick={() => void loadDrawerTicket(ticket.id)}>
                      <p className="font-medium">{numberDisplay}</p>
                      <p className="text-xs text-slate-600">
                        التصنيف: {categoryDisplay} — المنطقة: {zoneDisplay}
                      </p>
                      <p className="text-xs text-slate-600">
                        الحالة: {statusLabelAr(ticket.status)} — وقت الإنشاء: {formatSaudiDateTime(ticket.created_at)}
                      </p>
                      <TicketReceptionCaption ticket={ticket} className="mt-1" />
                      <p className="mt-1 text-slate-700">{ticket.title ?? ticket.location}</p>
                    </button>
                    {role === "technician" && tab === "area" && ticket.status !== "finished" ? (
                      !ticket.assigned_technician_id ? (
                        <button
                          type="button"
                          disabled={pendingClaimId === ticket.id || Boolean(pendingAcceptId)}
                          className="mt-2 min-h-11 rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                          onClick={() => void claimTicket(ticket.id)}
                        >
                          {pendingClaimId === ticket.id ? "جاري التأكيد..." : "قبول البلاغ"}
                        </button>
                      ) : ticket.assigned_technician_id === myUserId ? (
                        <button
                          type="button"
                          disabled
                          className="mt-2 min-h-11 cursor-not-allowed rounded-md border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-500"
                        >
                          تم الاستلام / قيد المباشرة
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled
                          className="mt-2 min-h-11 cursor-not-allowed rounded-md border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-500"
                        >
                          مُعيَّن لفني آخر
                        </button>
                      )
                    ) : null}
                    {role === "technician" &&
                    tab === "mine" &&
                    ticket.assigned_technician_id === myUserId &&
                    ticket.status === "received" ? (
                      <button
                        type="button"
                        disabled={pendingAcceptId === ticket.id || Boolean(pendingClaimId)}
                        className="mt-2 min-h-11 rounded-md bg-amber-500 px-3 py-2 text-xs font-semibold text-slate-900 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
                        onClick={() => void acceptTicket(ticket.id)}
                      >
                        {pendingAcceptId === ticket.id ? "جاري التأكيد..." : "تأكيد التنفيذ الميداني"}
                      </button>
                    ) : null}
                  </div>
                );
              })}
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
          await queryClient.invalidateQueries({ queryKey: ZONE_TICKETS_QUERY_KEY });
          const id = drawerTicketIdRef.current;
          if (id) {
            await loadDrawerTicket(id);
          }
        }}
        onMarkTicketRead={() => {}}
        canViewMap={canViewMap}
      />
    </div>
  );
}
