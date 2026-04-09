"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";

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
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const fixedUploadInputRef = useRef<HTMLInputElement | null>(null);

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

  useEffect(() => {
    if (!myUserId) return;
    const channel = supabase
      .channel(`my-work-assignments-${myUserId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "tickets" },
        (payload) => {
          const oldRow = payload.old as Partial<TechnicianTicket>;
          const newRow = payload.new as Partial<TechnicianTicket>;
          const oldAssigned = role === "supervisor" ? oldRow.assigned_supervisor_id : oldRow.assigned_technician_id;
          const newAssigned = role === "supervisor" ? newRow.assigned_supervisor_id : newRow.assigned_technician_id;
          if (oldAssigned !== myUserId && newAssigned === myUserId) {
            toast.success("تم إسناد بلاغ جديد لك.");
            void loadTickets();
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "tickets" },
        () => {
          void loadTickets();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [myUserId, role]);

  const selectedTicket = tickets.find((ticket) => ticket.id === selectedTicketId) ?? null;

  const pushCurrentGps = async () => {
    if (!myUserId || !navigator.geolocation) return;
    return new Promise<void>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const latitude = Number(position.coords.latitude.toFixed(6));
          const longitude = Number(position.coords.longitude.toFixed(6));
          const nowIso = new Date().toISOString();
          await Promise.all([
            supabase.from("live_locations").upsert({
              user_id: myUserId,
              latitude,
              longitude,
              last_updated: nowIso,
            }),
            supabase
              .from("profiles")
              .update({ current_latitude: latitude, current_longitude: longitude, last_location_at: nowIso, availability_status: "busy" })
              .eq("id", myUserId),
          ]);
          resolve();
        },
        () => resolve(),
        { enableHighAccuracy: true, timeout: 8000 },
      );
    });
  };

  const updateStatus = async (nextStatus: TicketStatus, extra?: Record<string, unknown>) => {
    if (!selectedTicket) return;

    setActing(true);
    const { error } = await supabase
      .from("tickets")
      .update({ status: nextStatus, ...(extra ?? {}) })
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

  const onStartDriving = async () => {
    await pushCurrentGps();
    await updateStatus("on_the_way");
  };

  const onArrived = async () => {
    await updateStatus("arrived");
  };

  const onFixedPickPhoto = () => {
    fixedUploadInputRef.current?.click();
  };

  const onFixedImageSelected = async (file: File | null) => {
    if (!file || !selectedTicket || !myUserId) return;
    setActing(true);
    const ext = file.name.split(".").pop() ?? "jpg";
    const filePath = `tickets/${selectedTicket.id}/after-fix-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("ticket-attachments")
      .upload(filePath, file, { upsert: false });
    if (uploadError) {
      toast.error(`فشل رفع صورة بعد الإصلاح: ${uploadError.message}`);
      setActing(false);
      return;
    }
    const { data: publicData } = supabase.storage.from("ticket-attachments").getPublicUrl(filePath);
    await supabase.from("ticket_attachments").insert({
      ticket_id: selectedTicket.id,
      uploaded_by: myUserId,
      file_url: publicData.publicUrl,
      file_type: "image",
    });
    await updateStatus("fixed");
  };

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
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>تفاصيل البلاغ</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p><span className="font-medium">رقم البلاغ:</span> {selectedTicket.external_ticket_number || selectedTicket.ticket_number || selectedTicket.id.slice(0, 8)}</p>
            <p><span className="font-medium">الموقع:</span> {selectedTicket.location}</p>
            <p><span className="font-medium">الوصف:</span> {selectedTicket.description}</p>
            <p><span className="font-medium">الحالة الحالية:</span> {statusLabel(selectedTicket.status)}</p>

            <input
              ref={fixedUploadInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => void onFixedImageSelected(e.target.files?.[0] ?? null)}
            />

            <div className="grid gap-2 sm:grid-cols-3">
              {(selectedTicket.status === "new" || selectedTicket.status === "assigned") ? (
                <Button className="h-12 bg-amber-600 text-base hover:bg-amber-700" onClick={() => void onStartDriving()} disabled={acting}>
                  في الطريق 🚗
                </Button>
              ) : null}

              {(selectedTicket.status === "assigned" || selectedTicket.status === "on_the_way") ? (
                <Button className="h-12 bg-sky-600 text-base hover:bg-sky-700" onClick={() => void onArrived()} disabled={acting}>
                  وصلت الموقع 📍
                </Button>
              ) : null}

              {selectedTicket.status !== "fixed" ? (
                <Button className="h-12 bg-emerald-600 text-base hover:bg-emerald-700" onClick={onFixedPickPhoto} disabled={acting}>
                  تم الإصلاح ✅
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}