"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { TicketChatPanel } from "@/components/ticket-chat-panel";

export type TicketStatus = "new" | "assigned" | "on_the_way" | "arrived" | "fixed";

export type TicketDetailRow = {
  id: string;
  ticket_number?: number | null;
  external_ticket_number?: string | null;
  title?: string | null;
  location: string;
  description: string;
  status: TicketStatus;
  assigned_engineer_id: string | null;
  assigned_supervisor_id?: string | null;
  assigned_technician_id?: string | null;
  claimed_at?: string | null;
  zone_id: string | null;
  category_id?: number | null;
  ticket_categories?: { name: string } | { name: string }[] | null;
  created_at: string;
};

type StaffOption = { staff_id: string; full_name: string };

type TicketDetailDrawerProps = {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  ticket: TicketDetailRow | null;
  zoneName: string;
  onTicketUpdated: () => Promise<void>;
  onMarkTicketRead: (ticketId: string, readAt: string) => void;
};

function statusBadgeVariant(status: TicketStatus): "red" | "yellow" | "green" | "muted" {
  if (status === "new") return "red";
  if (status === "on_the_way") return "yellow";
  if (status === "fixed") return "green";
  return "muted";
}

const STATUS_OPTIONS: TicketStatus[] = ["new", "assigned", "on_the_way", "arrived", "fixed"];

function statusLabel(status: TicketStatus): string {
  if (status === "new") return "جديد";
  if (status === "assigned") return "مُسند";
  if (status === "on_the_way") return "في الطريق";
  if (status === "arrived") return "تم الوصول";
  return "تم الإصلاح";
}

function categoryLabel(cat: TicketDetailRow["ticket_categories"]): string {
  if (!cat) return "-";
  if (Array.isArray(cat)) return cat[0]?.name ?? "-";
  return cat.name;
}

export function TicketDetailDrawer({
  open,
  onOpenChange,
  ticket,
  zoneName,
  onTicketUpdated,
  onMarkTicketRead,
}: TicketDetailDrawerProps) {
  const [senderNameMap, setSenderNameMap] = useState<Record<string, string>>({});
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [statusDraft, setStatusDraft] = useState<TicketStatus | "">("");
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [supervisorOptions, setSupervisorOptions] = useState<StaffOption[]>([]);
  const [technicianOptions, setTechnicianOptions] = useState<StaffOption[]>([]);
  const [supervisorPick, setSupervisorPick] = useState("");
  const [technicianPick, setTechnicianPick] = useState("");
  const [dispatching, setDispatching] = useState(false);
  const [actingField, setActingField] = useState(false);
  const fixedUploadInputRef = useRef<HTMLInputElement | null>(null);

  const ticketId = ticket?.id;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStatusDraft(ticket?.status ?? "");
    setSupervisorPick(ticket?.assigned_supervisor_id ?? "");
    setTechnicianPick(ticket?.assigned_technician_id ?? "");
  }, [ticket?.id, ticket?.status, ticket?.assigned_supervisor_id, ticket?.assigned_technician_id]);

  useEffect(() => {
    const loadMe = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setMyUserId(user?.id ?? null);
      if (!user?.id) {
        setMyRole(null);
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
      setMyRole((profile?.role as string | undefined) ?? null);
    };
    void loadMe();
  }, []);

  const loadAssignable = async () => {
    if (!ticketId) return;
    const { data: supData, error: supErr } = await supabase.rpc("assignable_staff_for_ticket", {
      p_ticket_id: ticketId,
      p_target_role: "supervisor",
    });
    if (!supErr && supData) {
      setSupervisorOptions((supData as StaffOption[]) ?? []);
    }
    const { data: techData, error: techErr } = await supabase.rpc("assignable_staff_for_ticket", {
      p_ticket_id: ticketId,
      p_target_role: "technician",
    });
    if (!techErr && techData) {
      setTechnicianOptions((techData as StaffOption[]) ?? []);
    }
  };

  useEffect(() => {
    if (!open || !ticketId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load RPC options when drawer opens
    void loadAssignable();
  }, [open, ticketId]);

  const loadRoleNameMap = async () => {
    if (!ticketId || !ticket) return;
    const senderIds = Array.from(
      new Set(
        [
          ticket.assigned_engineer_id,
          ticket.assigned_supervisor_id,
          ticket.assigned_technician_id,
        ].filter(Boolean) as string[],
      ),
    );
    if (senderIds.length === 0) {
      setSenderNameMap({});
      return;
    }
    const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", senderIds);
    const map: Record<string, string> = {};
    (profiles ?? []).forEach((profile) => {
      map[profile.id] = profile.full_name;
    });
    setSenderNameMap(map);
  };

  useEffect(() => {
    if (!open || !ticketId || !ticket) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resolve assignee display names
    void loadRoleNameMap();
  }, [open, ticketId, ticket?.assigned_engineer_id, ticket?.assigned_supervisor_id, ticket?.assigned_technician_id]);

  useEffect(() => {
    if (!open || !ticketId) return;
    const channel = supabase
      .channel(`ticket-drawer-ticket-${ticketId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "tickets", filter: `id=eq.${ticketId}` },
        async () => {
          await onTicketUpdated();
          void loadAssignable();
          void loadRoleNameMap();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [open, ticketId, onTicketUpdated]);

  const claimTask = async () => {
    if (!ticketId || !myUserId || !ticket) return;
    setStatusUpdating(true);
    const { error: rpcError } = await supabase.rpc("claim_ticket", { p_ticket_id: ticketId });
    if (!rpcError) {
      toast.success("تم استلام المهمة بنجاح.");
      await onTicketUpdated();
      setStatusUpdating(false);
      return;
    }
    const nextStatus: TicketStatus = ticket.status === "new" ? "assigned" : ticket.status;
    const { error } = await supabase
      .from("tickets")
      .update({ assigned_engineer_id: myUserId, status: nextStatus })
      .eq("id", ticketId);
    setStatusUpdating(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("تم استلام المهمة بنجاح.");
    await onTicketUpdated();
  };

  const updateStatus = async () => {
    if (!ticketId || !statusDraft) return;

    setStatusUpdating(true);
    const { error } = await supabase
      .from("tickets")
      .update({ status: statusDraft })
      .eq("id", ticketId);

    if (error) {
      toast.error(error.message);
      setStatusUpdating(false);
      return;
    }

    toast.success("تم تحديث حالة البلاغ.");
    await onTicketUpdated();
    setStatusUpdating(false);
  };

  const saveSupervisor = async () => {
    if (!ticketId || !ticket) return;
    setDispatching(true);
    const supId = supervisorPick || null;
    const nextStatus: TicketStatus = ticket.status === "new" && supId ? "assigned" : ticket.status;
    const { error } = await supabase
      .from("tickets")
      .update({ assigned_supervisor_id: supId, status: nextStatus })
      .eq("id", ticketId);
    setDispatching(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(supId ? "تم تعيين المشرف." : "تم إلغاء تعيين المشرف.");
    await onTicketUpdated();
  };

  const saveTechnician = async () => {
    if (!ticketId || !ticket) return;
    setDispatching(true);
    const techId = technicianPick || null;
    const nextStatus: TicketStatus = techId && ticket.status === "new" ? "assigned" : ticket.status;
    const { error } = await supabase
      .from("tickets")
      .update({ assigned_technician_id: techId, status: nextStatus })
      .eq("id", ticketId);
    setDispatching(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(techId ? "تم تكليف الفني المنفذ." : "تم إلغاء تكليف الفني.");
    await onTicketUpdated();
  };

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
              .update({
                current_latitude: latitude,
                current_longitude: longitude,
                last_location_at: nowIso,
                availability_status: "busy",
              })
              .eq("id", myUserId),
          ]);
          resolve();
        },
        () => resolve(),
        { enableHighAccuracy: true, timeout: 8000 },
      );
    });
  };

  const fieldUpdateStatus = async (next: TicketStatus) => {
    if (!ticketId) return;
    setActingField(true);
    const { error } = await supabase.from("tickets").update({ status: next }).eq("id", ticketId);
    setActingField(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("تم تحديث حالة البلاغ.");
    await onTicketUpdated();
  };

  const onStartDriving = async () => {
    await pushCurrentGps();
    await fieldUpdateStatus("on_the_way");
  };

  const onFixedPickPhoto = () => fixedUploadInputRef.current?.click();

  const onFixedImageSelected = async (file: File | null) => {
    if (!file || !ticketId || !myUserId) return;
    setActingField(true);
    const ext = file.name.split(".").pop() ?? "jpg";
    const filePath = `tickets/${ticketId}/after-fix-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("ticket-attachments")
      .upload(filePath, file, { upsert: false });
    if (uploadError) {
      toast.error(uploadError.message);
      setActingField(false);
      return;
    }
    const { data: publicData } = supabase.storage.from("ticket-attachments").getPublicUrl(filePath);
    await supabase.from("ticket_attachments").insert({
      ticket_id: ticketId,
      uploaded_by: myUserId,
      file_url: publicData.publicUrl,
      file_type: "image",
    });
    const { error } = await supabase.from("tickets").update({ status: "fixed" }).eq("id", ticketId);
    setActingField(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("تم إغلاق البلاغ مع صورة بعد الإصلاح.");
    await onTicketUpdated();
  };

  const title = useMemo(() => {
    if (!ticket) return "تفاصيل البلاغ";
    if (ticket.external_ticket_number) return `بلاغ ${ticket.external_ticket_number}`;
    if (ticket.ticket_number) return `بلاغ #${ticket.ticket_number}`;
    return `بلاغ ${ticket.id.slice(0, 8)}`;
  }, [ticket]);

  const canUpdateStatus =
    myRole === "admin" ||
    myRole === "project_manager" ||
    myRole === "projects_director" ||
    myRole === "supervisor" ||
    myRole === "technician" ||
    myRole === "reporter";
  const allowedStatusOptions = myRole === "reporter" ? (["fixed"] as TicketStatus[]) : STATUS_OPTIONS;

  const canUseChat =
    myRole === "technician" ||
    myRole === "supervisor" ||
    myRole === "engineer" ||
    myRole === "admin" ||
    myRole === "project_manager" ||
    myRole === "projects_director";

  const canDispatchSupervisor =
    myRole === "engineer" || myRole === "admin" || myRole === "project_manager" || myRole === "projects_director";

  const canDispatchTechnician =
    myRole === "admin" ||
    myRole === "project_manager" ||
    myRole === "projects_director" ||
    (myRole === "supervisor" && ticket?.assigned_supervisor_id === myUserId);

  const showTechnicianQuickActions =
    myRole === "technician" && ticket?.assigned_technician_id === myUserId && ticket.status !== "fixed";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent dir="rtl" className="flex w-full flex-col overflow-hidden sm:max-w-lg">
        {ticket ? (
          <div className="flex h-full min-h-0 flex-col gap-4">
            <SheetHeader className="shrink-0 space-y-1 text-right">
              <SheetTitle>{title}</SheetTitle>
              <SheetDescription>
                إدارة التوجيه ومركز التواصل والمرفقات لنفس البلاغ.
              </SheetDescription>
            </SheetHeader>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
              <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <h3 className="mb-3 text-sm font-semibold text-slate-900">إدارة التوجيه والبيانات</h3>
                <div className="space-y-2 text-sm">
                  <p>
                    <span className="font-medium">التصنيف:</span> {categoryLabel(ticket.ticket_categories)}
                  </p>
                  <p>
                    <span className="font-medium">المنطقة:</span> {zoneName || "-"}
                  </p>
                  <p>
                    <span className="font-medium">رقم البلاغ:</span>{" "}
                    {ticket.external_ticket_number || ticket.ticket_number || ticket.id.slice(0, 8)}
                  </p>
                  <p>
                    <span className="font-medium">العنوان:</span> {ticket.title ?? "-"}
                  </p>
                  <p>
                    <span className="font-medium">الموقع:</span> {ticket.location}
                  </p>
                  <p>
                    <span className="font-medium">الوصف:</span> {ticket.description}
                  </p>
                  <p>
                    <span className="font-medium">المهندس المسؤول:</span>{" "}
                    {ticket.assigned_engineer_id
                      ? senderNameMap[ticket.assigned_engineer_id] ?? ticket.assigned_engineer_id.slice(0, 8)
                      : "غير محدد"}
                  </p>
                  <p>
                    <span className="font-medium">المشرف:</span>{" "}
                    {ticket.assigned_supervisor_id
                      ? senderNameMap[ticket.assigned_supervisor_id] ?? ticket.assigned_supervisor_id.slice(0, 8)
                      : "غير مُكلّف"}
                  </p>
                  <p>
                    <span className="font-medium">الفني المنفذ:</span>{" "}
                    {ticket.assigned_technician_id
                      ? senderNameMap[ticket.assigned_technician_id] ?? ticket.assigned_technician_id.slice(0, 8)
                      : "غير مُكلّف"}
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <span className="font-medium">الحالة:</span>
                    <Badge variant={statusBadgeVariant(ticket.status)}>{statusLabel(ticket.status)}</Badge>
                  </div>
                </div>

                {canDispatchSupervisor ? (
                  <div className="mt-4 space-y-2 rounded-lg border border-indigo-200 bg-white p-3">
                    <p className="text-xs font-semibold text-indigo-900">تعيين المشرف / المراقب</p>
                    <select
                      className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                      value={supervisorPick}
                      onChange={(e) => setSupervisorPick(e.target.value)}
                    >
                      <option value="">— بدون —</option>
                      {supervisorOptions.map((o) => (
                        <option key={o.staff_id} value={o.staff_id}>
                          {o.full_name}
                        </option>
                      ))}
                    </select>
                    <Button className="w-full" disabled={dispatching} onClick={() => void saveSupervisor()}>
                      {dispatching ? "جاري الحفظ..." : "حفظ تعيين المشرف"}
                    </Button>
                  </div>
                ) : null}

                {canDispatchTechnician ? (
                  <div className="mt-3 space-y-2 rounded-lg border border-emerald-200 bg-white p-3">
                    <p className="text-xs font-semibold text-emerald-900">تكليف الفني المنفذ</p>
                    <select
                      className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                      value={technicianPick}
                      onChange={(e) => setTechnicianPick(e.target.value)}
                    >
                      <option value="">— بدون —</option>
                      {technicianOptions.map((o) => (
                        <option key={o.staff_id} value={o.staff_id}>
                          {o.full_name}
                        </option>
                      ))}
                    </select>
                    <Button className="w-full" variant="outline" disabled={dispatching} onClick={() => void saveTechnician()}>
                      {dispatching ? "جاري الحفظ..." : "حفظ تكليف الفني"}
                    </Button>
                  </div>
                ) : null}

                {myRole === "engineer" ? (
                  <div className="mt-3">
                    <Button
                      onClick={() => void claimTask()}
                      disabled={statusUpdating || ticket.assigned_engineer_id === myUserId}
                    >
                      {ticket.assigned_engineer_id === myUserId ? "تم الاستلام" : "استلام المهمة"}
                    </Button>
                  </div>
                ) : null}

                {canUpdateStatus ? (
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                    <select
                      className="h-10 flex-1 rounded-md border border-slate-200 bg-white px-3 text-sm"
                      value={statusDraft}
                      onChange={(e) => setStatusDraft(e.target.value as TicketStatus)}
                    >
                      {allowedStatusOptions.map((status) => (
                        <option key={status} value={status}>
                          {statusLabel(status)}
                        </option>
                      ))}
                    </select>
                    <Button onClick={() => void updateStatus()} disabled={statusUpdating || statusDraft === ticket.status}>
                      {statusUpdating ? "جاري التحديث..." : "تحديث الحالة"}
                    </Button>
                  </div>
                ) : null}

                {showTechnicianQuickActions ? (
                  <div className="mt-4 space-y-2">
                    <input
                      ref={fixedUploadInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => void onFixedImageSelected(e.target.files?.[0] ?? null)}
                    />
                    <p className="text-xs font-medium text-slate-600">تنفيذ سريع (ميداني)</p>
                    <div className="grid grid-cols-1 gap-2">
                      {ticket.status === "new" || ticket.status === "assigned" ? (
                        <Button
                          className="h-12 bg-amber-600 text-base hover:bg-amber-700"
                          disabled={actingField}
                          onClick={() => void onStartDriving()}
                        >
                          في الطريق 🚗
                        </Button>
                      ) : null}
                      {ticket.status === "assigned" || ticket.status === "on_the_way" ? (
                        <Button
                          className="h-12 bg-sky-600 text-base hover:bg-sky-700"
                          disabled={actingField}
                          onClick={() => void fieldUpdateStatus("arrived")}
                        >
                          وصلت الموقع 📍
                        </Button>
                      ) : null}
                      {ticket.status !== "fixed" ? (
                        <Button
                          className="h-12 bg-emerald-600 text-base hover:bg-emerald-700"
                          disabled={actingField}
                          onClick={onFixedPickPhoto}
                        >
                          تم الإصلاح ✅
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </section>

              {ticketId ? (
                <TicketChatPanel
                  ticketId={ticketId}
                  canPost={Boolean(canUseChat)}
                  onTicketUpdated={onTicketUpdated}
                  onMarkTicketRead={onMarkTicketRead}
                />
              ) : null}
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
