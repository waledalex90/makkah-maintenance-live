"use client";

import { useEffect, useRef, useState } from "react";
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
};

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

    const filterKey = role === "supervisor" ? "assigned_supervisor_id" : "assigned_technician_id";
    const { data, error } = await supabase
      .from("tickets")
      .select("id, ticket_number, external_ticket_number, location, description, status, created_at, assigned_technician_id, assigned_supervisor_id")
      .eq(filterKey, user.id)
      .order("created_at", { ascending: false });

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    setTickets((data as TechnicianTicket[]) ?? []);
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
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [myUserId, role]);

  return (
    <div className="space-y-4" dir="rtl" lang="ar">
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
                <button
                  key={ticket.id}
                  type="button"
                  onClick={() => void loadDrawerTicket(ticket.id)}
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-3 text-right text-sm transition hover:border-slate-400 hover:bg-slate-50"
                >
                  <p className="font-medium">{ticket.external_ticket_number || `#${ticket.ticket_number ?? "-"}`}</p>
                  <p className="text-slate-700">{ticket.location}</p>
                  <p className="text-xs text-slate-500">الحالة: {statusLabel(ticket.status)}</p>
                </button>
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
