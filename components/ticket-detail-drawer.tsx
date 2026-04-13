"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import imageCompression from "browser-image-compression";
import { Camera, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { pushLiveLocationOnce } from "@/lib/push-live-location";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { TicketChatPanel } from "@/components/ticket-chat-panel";
import { formatSaudiDateTime } from "@/lib/saudi-time";
import {
  TICKET_STATUS_VALUES,
  type TicketStatus,
  statusBadgeVariant,
  statusLabelAr,
} from "@/lib/ticket-status";
import { TicketReceptionCaption } from "@/components/ticket-reception-caption";

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
  latitude?: number | null;
  longitude?: number | null;
  closed_by?: string | null;
  assigned_technician?: { full_name: string } | null;
  assigned_supervisor?: { full_name: string } | null;
  assigned_engineer?: { full_name: string } | null;
  closed_by_profile?: { full_name: string } | null;
};

type TicketDetailDrawerProps = {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  ticket: TicketDetailRow | null;
  zoneName: string;
  onTicketUpdated: () => Promise<void>;
  onMarkTicketRead: (ticketId: string, readAt: string) => void;
  /** عرض الخريطة المصغّرة (صلاحية الخريطة) */
  canViewMap?: boolean;
};

const TicketMiniMap = dynamic(
  () => import("@/components/ticket-detail-live-map").then((m) => m.TicketDetailLiveMap),
  {
    ssr: false,
    loading: () => <div className="h-44 w-full animate-pulse rounded-xl bg-slate-100" />,
  },
);

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

export function TicketDetailDrawer({
  open,
  onOpenChange,
  ticket,
  zoneName,
  onTicketUpdated,
  onMarkTicketRead,
  canViewMap = false,
}: TicketDetailDrawerProps) {
  const [senderNameMap, setSenderNameMap] = useState<Record<string, string>>({});
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [statusDraft, setStatusDraft] = useState<TicketStatus | "">("");
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [trackedLivePin, setTrackedLivePin] = useState<{ latitude: number; longitude: number } | null>(null);
  const [actingField, setActingField] = useState(false);
  const fixedUploadInputRef = useRef<HTMLInputElement | null>(null);
  const dropzoneInputRef = useRef<HTMLInputElement | null>(null);
  const [ticketAttachments, setTicketAttachments] = useState<TicketAttachmentListRow[]>([]);
  const [dropHighlight, setDropHighlight] = useState(false);

  const ticketId = ticket?.id;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStatusDraft(ticket?.status ?? "");
  }, [ticket?.id, ticket?.status]);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

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

  const trackedStaffId = useMemo(() => {
    if (!ticket) return null;
    return (
      ticket.assigned_technician_id ?? ticket.assigned_engineer_id ?? ticket.assigned_supervisor_id ?? null
    );
  }, [ticket]);

  const trackedStaffLabel = useMemo(() => {
    if (!ticket || !trackedStaffId) return "موقع الموظف";
    if (ticket.assigned_technician_id === trackedStaffId) {
      return ticket.assigned_technician?.full_name ?? "الفني";
    }
    if (ticket.assigned_engineer_id === trackedStaffId) {
      return ticket.assigned_engineer?.full_name ?? "المهندس";
    }
    if (ticket.assigned_supervisor_id === trackedStaffId) {
      return ticket.assigned_supervisor?.full_name ?? "المشرف";
    }
    return "موقع الموظف";
  }, [ticket, trackedStaffId]);

  useEffect(() => {
    if (!open || !canViewMap || !trackedStaffId || ticket?.status === "not_received") {
      setTrackedLivePin(null);
      return;
    }
    const loadLoc = async () => {
      const { data } = await supabase
        .from("live_locations")
        .select("latitude, longitude")
        .eq("user_id", trackedStaffId)
        .maybeSingle();
      if (data) {
        setTrackedLivePin({ latitude: data.latitude, longitude: data.longitude });
      } else {
        setTrackedLivePin(null);
      }
    };
    void loadLoc();
    const channel = supabase
      .channel(`drawer-live-loc-${trackedStaffId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "live_locations", filter: `user_id=eq.${trackedStaffId}` },
        () => void loadLoc(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [open, canViewMap, trackedStaffId, ticket?.status, ticket?.id]);

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
      await pushLiveLocationOnce();
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
    await pushLiveLocationOnce();
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
    await pushLiveLocationOnce();
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

  const reloadAttachments = async () => {
    if (!ticketId) return;
    const { data } = await supabase
      .from("ticket_attachments")
      .select("id, file_url, file_name, file_type, sort_order")
      .eq("ticket_id", ticketId)
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true });
    setTicketAttachments((data as TicketAttachmentListRow[]) ?? []);
  };

  const addAttachmentsFromFiles = async (files: FileList | File[] | null) => {
    if (!files || !ticketId || !myUserId) return;
    const list = Array.from(files);
    if (list.length === 0) return;
    const MAX_VIDEO_BYTES = 80 * 1024 * 1024;
    setActingField(true);
    try {
      for (const file of list) {
        if (file.size > MAX_VIDEO_BYTES && file.type.startsWith("video/")) {
          toast.error(`الملف كبير جداً: ${file.name}`);
          continue;
        }
        const isVideo =
          file.type.startsWith("video/") || /\.(mp4|webm|mov|ogg)(\?|$)/i.test(file.name);
        let body: File | Blob = file;
        if (!isVideo && file.type.startsWith("image/")) {
          body = await imageCompression(file, {
            maxSizeMB: 4,
            maxWidthOrHeight: 1920,
            useWebWorker: true,
            initialQuality: 0.85,
          });
        }
        const ext =
          body instanceof File
            ? body.name.split(".").pop() ?? (isVideo ? "mp4" : "jpg")
            : isVideo
              ? "mp4"
              : "jpg";
        const filePath = `${ticketId}-up-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: uploadError } = await supabase.storage.from("tickets").upload(filePath, body, { upsert: false });
        if (uploadError) {
          toast.error(uploadError.message);
          continue;
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
          file_type: isVideo ? "video" : "image",
          file_name: file.name,
          sort_order: nextOrder,
        });
      }
      toast.success("تم رفع الملفات.");
      await reloadAttachments();
      await onTicketUpdated();
    } finally {
      setActingField(false);
    }
  };

  const title = useMemo(() => {
    if (!ticket) return "تفاصيل البلاغ";
    if (ticket.external_ticket_number) return `بلاغ ${ticket.external_ticket_number}`;
    if (ticket.ticket_number) return `بلاغ #${ticket.ticket_number}`;
    return `بلاغ ${ticket.id.slice(0, 8)}`;
  }, [ticket]);

  const mapFocusPoint = useMemo<[number, number]>(() => {
    if (ticket?.latitude != null && ticket?.longitude != null) {
      return [Number(ticket.latitude), Number(ticket.longitude)];
    }
    return [21.4225, 39.8262];
  }, [ticket?.latitude, ticket?.longitude]);

  const mapStaffPins = useMemo(
    () =>
      trackedLivePin && trackedStaffId
        ? [
            {
              user_id: trackedStaffId,
              full_name: trackedStaffLabel,
              role: "field",
              status: "busy" as const,
              latitude: trackedLivePin.latitude,
              longitude: trackedLivePin.longitude,
            },
          ]
        : [],
    [trackedLivePin, trackedStaffId, trackedStaffLabel],
  );

  const mapTicketLabel = useMemo(() => {
    if (!ticket) return "";
    return ticket.external_ticket_number || (ticket.ticket_number != null ? `#${ticket.ticket_number}` : ticket.id.slice(0, 8));
  }, [ticket]);

  const canUpdateStatus =
    myRole === "admin" ||
    myRole === "project_manager" ||
    myRole === "projects_director" ||
    myRole === "engineer" ||
    myRole === "supervisor" ||
    myRole === "technician" ||
    myRole === "data_entry" ||
    myRole === "reporter";
  const allowedStatusOptions = myRole === "reporter" ? (["finished"] as TicketStatus[]) : TICKET_STATUS_VALUES;

  const canUseChat =
    myRole === "technician" ||
    myRole === "supervisor" ||
    myRole === "engineer" ||
    myRole === "data_entry" ||
    myRole === "admin" ||
    myRole === "project_manager" ||
    myRole === "projects_director";

  const showFieldQuickActions =
    (myRole === "technician" || myRole === "supervisor" || myRole === "engineer") &&
    ticket?.status !== "finished";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        dir="rtl"
        className="flex h-[100dvh] w-full flex-col overflow-hidden border-slate-200 bg-white text-slate-900 sm:max-w-lg"
        style={{ colorScheme: "light" }}
      >
        {ticket ? (
          <div className="flex h-full min-h-0 flex-col gap-4">
            <SheetHeader className="shrink-0 space-y-1 text-right">
              <SheetTitle>{title}</SheetTitle>
              <SheetDescription>تفاصيل البلاغ، المرفقات، الدردشة، والتتبع عند توفر الصلاحيات.</SheetDescription>
            </SheetHeader>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain scroll-smooth px-0.5 pb-2 pr-1">
              <section className="rounded-xl border border-slate-200 bg-white p-4">
                <h3 className="mb-3 text-sm font-semibold text-slate-900">بيانات البلاغ</h3>
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
                  <div className="flex flex-col gap-1 pt-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">الحالة:</span>
                      <Badge variant={statusBadgeVariant(ticket.status)}>{statusLabelAr(ticket.status)}</Badge>
                    </div>
                    <TicketReceptionCaption ticket={ticket} />
                  </div>
                </div>

                {myRole === "engineer" ? (
                  <div className="mt-3">
                    <Button
                      onClick={() => void claimTask()}
                      disabled={statusUpdating || ticket.assigned_engineer_id === myUserId}
                      className={
                        ticket.assigned_engineer_id === myUserId
                          ? "pointer-events-none bg-slate-200 text-slate-600 hover:bg-slate-200"
                          : undefined
                      }
                    >
                      {ticket.assigned_engineer_id === myUserId ? "تم الاستلام / قيد المباشرة" : "استلام المهمة"}
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
                <h3 className="mb-3 text-sm font-semibold text-slate-900">المرفقات والتوثيق</h3>
                <input
                  ref={dropzoneInputRef}
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    void addAttachmentsFromFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  disabled={!ticketId || !myUserId || actingField}
                  onClick={() => dropzoneInputRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDropHighlight(true);
                  }}
                  onDragLeave={() => setDropHighlight(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDropHighlight(false);
                    void addAttachmentsFromFiles(e.dataTransfer.files);
                  }}
                  className={cn(
                    "flex min-h-[120px] w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition",
                    dropHighlight ? "border-emerald-400 bg-emerald-50/80" : "border-slate-300 bg-slate-50/80",
                    (!ticketId || !myUserId || actingField) && "cursor-not-allowed opacity-60",
                  )}
                >
                  <div className="flex items-center gap-2 text-slate-600">
                    <Camera className="h-7 w-7" aria-hidden />
                    <Plus className="h-6 w-6" aria-hidden />
                  </div>
                  <p className="text-sm font-medium text-slate-800">اسحب الصور أو الفيديو هنا أو انقر للرفع</p>
                  <p className="text-xs text-slate-500">لتوثيق الموقع أو الإصلاح (صور وفيديو)</p>
                </button>
                {ticketAttachments.length === 0 ? (
                  <p className="mt-3 text-xs text-slate-500">لا توجد مرفقات مسجلة بعد.</p>
                ) : (
                  <ul className="mt-4 space-y-3">
                    {ticketAttachments.map((att) => (
                      <li key={att.id} className="text-xs text-slate-700">
                        <a
                          href={att.file_url}
                          target="_blank"
                          rel="noreferrer"
                          className="block overflow-hidden rounded-lg border border-slate-200"
                        >
                          {att.file_type === "video" || /\.(mp4|webm|mov|ogg)(\?|$)/i.test(att.file_url) ? (
                            <video
                              src={att.file_url}
                              className="h-32 w-full object-cover"
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
                              height={256}
                              loading="lazy"
                              decoding="async"
                              className="h-32 w-full object-cover"
                            />
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

              {canViewMap ? (
                <section className="rounded-xl border border-slate-200 bg-white p-4">
                  <h3 className="mb-2 text-sm font-semibold text-slate-900">الموقع والخريطة</h3>
                  {ticket.status === "not_received" ? (
                    <p className="rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-600">
                      في انتظار مباشرة المهمة لبدء التتبع
                    </p>
                  ) : (
                    <TicketMiniMap focusPoint={mapFocusPoint} staffPins={mapStaffPins} ticketLabel={mapTicketLabel} />
                  )}
                </section>
              ) : null}

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
