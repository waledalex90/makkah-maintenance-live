"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";

type TicketStatus = "new" | "assigned" | "on_the_way" | "arrived" | "fixed";

type TechnicianTicket = {
  id: string;
  location: string;
  description: string;
  status: TicketStatus;
  created_at: string;
  assigned_technician_id: string | null;
};

function statusLabel(status: TicketStatus): string {
  if (status === "new") return "جديد";
  if (status === "assigned") return "مُسند";
  if (status === "on_the_way") return "في الطريق";
  if (status === "arrived") return "تم الوصول";
  return "تم الإصلاح";
}

export function TechnicianWorkList() {
  const [tickets, setTickets] = useState<TechnicianTicket[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

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

    const { data, error } = await supabase
      .from("tickets")
      .select("id, location, description, status, created_at, assigned_technician_id")
      .eq("assigned_technician_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    const rows = (data as TechnicianTicket[]) ?? [];
    setTickets(rows);
    if (!selectedTicketId && rows.length > 0) {
      setSelectedTicketId(rows[0].id);
    }
    setLoading(false);
  };

  useEffect(() => {
    void loadTickets();
  }, []);

  const selectedTicket = tickets.find((ticket) => ticket.id === selectedTicketId) ?? null;

  const updateStatus = async (nextStatus: TicketStatus) => {
    if (!selectedTicket) return;

    setActing(true);
    const { error } = await supabase
      .from("tickets")
      .update({ status: nextStatus })
      .eq("id", selectedTicket.id);

    if (error) {
      toast.error(error.message);
      setActing(false);
      return;
    }

    toast.success("تم تحديث البلاغ بنجاح.");
    await loadTickets();
    setActing(false);
  };

  return (
    <div className="space-y-4" dir="rtl" lang="ar">
      <Card>
        <CardHeader>
          <CardTitle>بلاغاتي المسندة</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-slate-500">جاري التحميل...</p>
          ) : tickets.length === 0 ? (
            <p className="text-sm text-slate-500">لا توجد بلاغات مسندة حالياً.</p>
          ) : (
            <div className="space-y-2">
              {tickets.map((ticket) => (
                <button
                  key={ticket.id}
                  onClick={() => setSelectedTicketId(ticket.id)}
                  className={`w-full rounded-md border px-3 py-2 text-right text-sm transition ${
                    selectedTicketId === ticket.id
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white hover:bg-slate-50"
                  }`}
                >
                  <p className="font-medium">{ticket.location}</p>
                  <p className="text-xs opacity-80">الحالة: {statusLabel(ticket.status)}</p>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedTicket ? (
        <Card>
          <CardHeader>
            <CardTitle>تفاصيل البلاغ</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p><span className="font-medium">الموقع:</span> {selectedTicket.location}</p>
            <p><span className="font-medium">الوصف:</span> {selectedTicket.description}</p>
            <p><span className="font-medium">الحالة الحالية:</span> {statusLabel(selectedTicket.status)}</p>

            <div className="flex flex-wrap gap-2">
              {(selectedTicket.status === "new" || selectedTicket.status === "assigned") ? (
                <Button onClick={() => void updateStatus("on_the_way")} disabled={acting}>
                  بدء التنفيذ
                </Button>
              ) : null}

              {selectedTicket.status !== "fixed" ? (
                <Button variant="outline" onClick={() => void updateStatus("fixed")} disabled={acting}>
                  تعليم كمُصلح
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}