"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import imageCompression from "browser-image-compression";
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
import { ensureGpsPermission } from "@/lib/gps-permission";
import { formatSaudiDateTime, formatSaudiTime } from "@/lib/saudi-time";
import {
  TICKET_STATUS_VALUES,
  type TicketStatus,
  statusBadgeVariant,
  statusLabelAr,
} from "@/lib/ticket-status";

export type { TicketStatus } from "@/lib/ticket-status";

export type TicketDetailRow = {
  id: string;
  ticket_number?: number | null;
  external_ticket_number?: string | null;
  reporter_name?: string | null;
  reporter_phone?: string | null;
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
  category?: string | null;
  ticket_categories?: { name: string } | { name: string }[] | null;
  created_at: string;
  closed_at?: string | null;
};

type StaffOption = { staff_id: string; full_name: string };
type ProfileOptionRow = {
  id: string;
  full_name: string;
  specialty?: string | null;
};

type TicketDetailDrawerProps = {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  ticket: TicketDetailRow | null;
  zoneName: string;
  onTicketUpdated: () => Promise<void>;
  onMarkTicketRead: (ticketId: string, readAt: string) => void;
};

function categoryLabel(cat: TicketDetailRow["ticket_categories"]): string {
  if (!cat) return "-";
  if (Array.isArray(cat)) return cat[0]?.name ?? "-";
  return cat.name;
}

function resolvedCategoryLabel(ticket: TicketDetailRow): string {
  const fromCol = ticket.category?.trim();
  if (fromCol) return fromCol;
  return categoryLabel(ticket.ticket_categories);
}

type TicketAttachmentListRow = {
  id: number;
  file_url: string;
  file_name: string | null;
  file_type?: string | null;
  sort_order: number;
};

function mapCategoryToSpecialty(categoryName: string): string | null {
  const lower = categoryName.toLowerCase();
  if (lower.includes("حريق") || lower.includes("fire")) return "fire";
  if (lower.includes("كهرباء") || lower.includes("electric")) return "electricity";
  if (lower.includes("تكييف") || lower.includes("ac")) return "ac";
  if (lower.includes("مدني") || lower.includes("مدنى") || lower.includes("civil")) return "civil";
  if (lower.includes("مطابخ") || lower.includes("kitchen")) return "kitchens";
  return null;
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
  const [ticketAttachments, setTicketAttachments] = useState<TicketAttachmentListRow[]>([]);

  const ticketId = ticket?.id;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStatusDraft(ticket?.status ?? "");
    setSupervisorPick(ticket?.assigned_supervisor_id ?? "");
    setTechnicianPick(ticket?.assigned_technician_id ?? "");
  }, [ticket?.id, ticket?.status, ticket?.assigned_supervisor_id, ticket?.assigned_technician_id]);

  useEffect(() => {
    if (!open || !ticketId) {
      return;
    }
    const loadAtt = async () => {
      const { data, error } = await supabase
        .from("ticket_attachments")
        .select("id, file_url, file_name, file_type, sort_order")
        .eq("ticket_id", ticketId)
        .order("sort_order", { ascending: true })
        .order("id", { ascending: true });
      if (error) {
        setTicketAttachments([]);
        return;
      }
      setTicketAttachments((data as TicketAttachmentListRow[]) ?? []);
    };
    void loadAtt();
  }, [open, ticketId]);

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
    if (!ticketId) {
      setSupervisorOptions([]);
      setTechnicianOptions([]);
      return;
    }
    const ticketSpecialty = mapCategoryToSpecialty(categoryLabel(ticket.ticket_categories));
    const isTopLevel = myRole === "admin" || myRole === "projects_director";
    const isProjectManager = myRole === "project_manager";

    let profileIds: string[] = [];
    if (!isTopLevel && !isProjectManager) {
      if (!ticket?.zone_id) {
        setSupervisorOptions([]);
        setTechnicianOptions([]);
        return;
      }
      const { data: zoneLinks } = await supabase.from("zone_profiles").select("profile_id").eq("zone_id", ticket.zone_id);
      profileIds = (zoneLinks ?? []).map((row) => row.profile_id as string);
      if (profileIds.length === 0) {
        setSupervisorOptions([]);
        setTechnicianOptions([]);
        return;
      }
    }

    let supervisorsQuery = supabase
      .from("profiles")
      .select("id, full_name")
      .eq("role", "supervisor")
      .or("availability_status.eq.available,availability_status.is.null")
      .order("full_name");
    if (!isTopLevel && !isProjectManager) {
      supervisorsQuery = supervisorsQuery.in("id", profileIds);
    }
    const { data: supervisors } = await supervisorsQuery;
    setSupervisorOptions(
      ((supervisors as ProfileOptionRow[]) ?? []).map((row) => ({
        staff_id: row.id,
        full_name: row.full_name,
      })),
    );

    let techniciansQuery = supabase
      .from("profiles")
      .select("id, full_name, specialty")
      .eq("role", "technician")
      .or("availability_status.eq.available,availability_status.is.null")
      .order("full_name");
    if (!isTopLevel && !isProjectManager) {
      techniciansQuery = techniciansQuery.in("id", profileIds);
    }
    if (ticketSpecialty) {
      techniciansQuery = techniciansQuery.eq("specialty", ticketSpecialty);
    }
    const { data: technicians } = await techniciansQuery;
    setTechnicianOptions(
      ((technicians as ProfileOptionRow[]) ?? []).map((row) => ({
        staff_id: row.id,
        full_name: row.full_name,
      })),
    );
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
    const nextStatus: TicketStatus = ticket.status === "not_received" ? "received" : ticket.status;
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

    if (
      statusDraft === "finished" &&
      ticketAttachments.length === 0 &&
      (myRole === "technician" || myRole === "supervisor" || myRole === "engineer")
    ) {
      toast.error("أضف مرفقاً يوضّح الإصلاح أو استخدم «تم الإصلاح» مع صورة قبل الإغلاق.");
      return;
    }

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
    const nextStatus: TicketStatus = ticket.status === "not_received" && supId ? "received" : ticket.status;
    const { error } = await supabase
      .from("tickets")
      .update({ assigned_supervisor_id: supId, status: nextStatus })
      .eq("id", ticketId);
    setDispatching(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (supId && myUserId) {
      const actorName = senderNameMap[myUserId] ?? "المهندس";
      const selectedName = supervisorOptions.find((o) => o.staff_id === supId)?.full_name ?? "مراقب";
      const nowLabel = formatSaudiTime(Date.now());
      await supabase.from("ticket_messages").insert({
        ticket_id: ticketId,
        sender_id: myUserId,
        content: `تكليفات: ${actorName} عيّن المراقب ${selectedName} - الساعة ${nowLabel}.`,
      });
    }
    toast.success(supId ? "تم تعيين المشرف." : "تم إلغاء تعيين المشرف.");
    await onTicketUpdated();
  };

  const saveTechnician = async () => {
    if (!ticketId || !ticket) return;
    setDispatching(true);
    const techId = technicianPick || null;
    const nextStatus: TicketStatus = techId && ticket.status === "not_received" ? "received" : ticket.status;
    const { error } = await supabase
      .from("tickets")
      .update({ assigned_technician_id: techId, status: nextStatus })
      .eq("id", ticketId);
    setDispatching(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (techId && myUserId) {
      const actorName = senderNameMap[myUserId] ?? "المشرف";
      const selectedName = technicianOptions.find((o) => o.staff_id === techId)?.full_name ?? "فني";
      const nowLabel = formatSaudiTime(Date.now());
      await supabase.from("ticket_messages").insert({
        ticket_id: ticketId,
        sender_id: myUserId,
        content: `تكليفات: ${actorName} عيّن الفني ${selectedName} - الساعة ${nowLabel}.`,
      });
    }
    toast.success(techId ? "تم تكليف الفني المنفذ." : "تم إلغاء تكليف الفني.");
    await onTicketUpdated();
  };

  const pushCurrentGps = async () => {
    if (!myUserId) return;
    const permission = await ensureGpsPermission();
    if (permission === "unsupported") return;
    if (permission === "insecure") {
      toast.error("تحديث GPS يتطلب HTTPS في بيئة الإنتاج.");
      return;
    }
    if (permission === "denied") {
      toast.error("صلاحية GPS مرفوضة. فعّلها من إعدادات المتصفح.");
      return;
    }
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
    await fieldUpdateStatus("received");
  };

  const onFixedPickPhoto = () => fixedUploadInputRef.current?.click();

  const onFixedImageSelected = async (file: File | null) => {
    if (!file || !ticketId || !myUserId) return;
    setActingField(true);
    const compressedImage = await imageCompression(file, {
      maxSizeMB: 1,
      maxWidthOrHeight: 1600,
      useWebWorker: true,
      initialQuality: 0.8,
    });
    const ext = compressedImage.name.split(".").pop() ?? "jpg";
    const filePath = `${ticketId}-after-fix-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("tickets")
      .upload(filePath, compressedImage, { upsert: false });
    if (uploadError) {
      toast.error(uploadError.message);
      setActingField(false);
      return;
    }
    const { data: publicData } = supabase.storage.from("tickets").getPublicUrl(filePath);
    const { data: lastRow } = await supabase
      .from("ticket_attachments")
      .select("sort_order")
      .eq("ticket_id", ticketId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextOrder = (lastRow?.sort_order ?? -1) + 1;
    await supabase.from("ticket_attachments").insert({
      ticket_id: ticketId,
      uploaded_by: myUserId,
      file_url: publicData.publicUrl,
      file_type: "image",
      file_name: compressedImage.name,
      sort_order: nextOrder,
    });
    const { error } = await supabase.from("tickets").update({ status: "finished" }).eq("id", ticketId);
    setActingField(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("تم إغلاق البلاغ مع صورة بعد الإصلاح.");
    const { data: refreshed } = await supabase
      .from("ticket_attachments")
      .select("id, file_url, file_name, file_type, sort_order")
      .eq("ticket_id", ticketId)
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true });
    setTicketAttachments((refreshed as TicketAttachmentListRow[]) ?? []);
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
    myRole === "engineer" ||
    myRole === "supervisor" ||
    myRole === "technician" ||
    myRole === "reporter";
  const allowedStatusOptions = myRole === "reporter" ? (["finished"] as TicketStatus[]) : TICKET_STATUS_VALUES;

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

  const showFieldQuickActions =
    (myRole === "technician" || myRole === "supervisor" || myRole === "engineer") &&
    ticket?.status !== "finished";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        dir="rtl"
        className="flex w-full flex-col overflow-hidden border-slate-200 bg-white text-slate-900 sm:max-w-lg"
        style={{ colorScheme: "light" }}
      >
        {ticket ? (
          <div className="flex h-full min-h-0 flex-col gap-4">
            <SheetHeader className="shrink-0 space-y-1 text-right">
              <SheetTitle>{title}</SheetTitle>
              <SheetDescription>
                إدارة التوجيه ومركز التواصل والمرفقات لنفس البلاغ.
              </SheetDescription>
            </SheetHeader>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
              <section className="rounded-xl border border-slate-200 bg-white p-4">
                <h3 className="mb-3 text-sm font-semibold text-slate-900">إدارة التوجيه والبيانات</h3>
                <div className="space-y-2 text-sm">
                  <p>
                    <span className="font-medium">التصنيف:</span> {resolvedCategoryLabel(ticket)}
                  </p>
                  <p>
                    <span className="font-medium">المنطقة:</span> {zoneName || "-"}
                  </p>
                  <p>
                    <span className="font-medium">رقم البلاغ:</span>{" "}
                    {ticket.external_ticket_number || ticket.ticket_number || ticket.id.slice(0, 8)}
                  </p>
                  <p>
                    <span className="font-medium">اسم مقدم البلاغ:</span> {ticket.reporter_name ?? "—"}
                  </p>
                  <p dir="ltr" className="text-right">
                    <span className="font-medium" dir="rtl">
                      رقم تليفون مقدم البلاغ:
                    </span>{" "}
                    {ticket.reporter_phone ?? "—"}
                  </p>
                  <p>
                    <span className="font-medium">موقع البلاغ:</span> {ticket.title ?? "-"}
                  </p>
                  <p>
                    <span className="font-medium">الوصف:</span> {ticket.description}
                  </p>
                  <p>
                    <span className="font-medium">وقت إنشاء البلاغ:</span> {formatSaudiDateTime(ticket.created_at)}
                  </p>
                  {ticket.closed_at ? (
                    <p>
                      <span className="font-medium">وقت الإغلاق:</span> {formatSaudiDateTime(ticket.closed_at)}
                    </p>
                  ) : null}
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
                    <Badge variant={statusBadgeVariant(ticket.status)}>{statusLabelAr(ticket.status)}</Badge>
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
                          {statusLabelAr(status)}
                        </option>
                      ))}
                    </select>
                    <Button onClick={() => void updateStatus()} disabled={statusUpdating || statusDraft === ticket.status}>
                      {statusUpdating ? "جاري التحديث..." : "تحديث الحالة"}
                    </Button>
                  </div>
                ) : null}

                {showFieldQuickActions ? (
                  <div className="mt-4 space-y-2">
                    <input
                      ref={fixedUploadInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => void onFixedImageSelected(e.target.files?.[0] ?? null)}
                    />
                    <p className="text-xs font-medium text-slate-600">تنفيذ سريع (ميداني)</p>
                    <div className="grid grid-cols-1 gap-2">
                      {ticket.status === "not_received" ? (
                        <Button
                          className="h-12 bg-amber-500 text-base text-slate-900 hover:bg-amber-400"
                          disabled={actingField}
                          onClick={() => void onStartDriving()}
                        >
                          تم الاستلام — في الطريق
                        </Button>
                      ) : null}
                      {ticket.status !== "finished" ? (
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

              <section className="rounded-xl border border-slate-200 bg-white p-4">
                <h3 className="mb-2 text-sm font-semibold text-slate-900">المرفقات</h3>
                {ticketAttachments.length === 0 ? (
                  <p className="text-xs text-slate-500">لا توجد مرفقات مسجلة لهذا البلاغ.</p>
                ) : (
                  <ul className="space-y-3">
                    {ticketAttachments.map((att) => (
                      <li key={att.id} className="text-xs text-slate-700">
                        <a href={att.file_url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-slate-200">
                          {att.file_type === "video" || /\.(mp4|webm|mov|ogg)(\?|$)/i.test(att.file_url) ? (
                            <video src={att.file_url} className="h-32 w-full object-cover" controls muted playsInline />
                          ) : (
                            <img src={att.file_url} alt={att.file_name ?? "مرفق"} className="h-32 w-full object-cover" />
                          )}
                        </a>
                        <p className="mt-1 text-right">
                          الرتبة {att.sort_order + 1} — {att.file_name ?? "بدون اسم"}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
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
