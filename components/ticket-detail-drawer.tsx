"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type TicketStatus = "new" | "assigned" | "on_the_way" | "arrived" | "fixed";

type TicketRow = {
  id: string;
  location: string;
  description: string;
  status: TicketStatus;
  assigned_engineer_id: string | null;
  claimed_at?: string | null;
  zone_id: string | null;
  created_at: string;
};

type ChatMessage = {
  id: number;
  ticket_id: string;
  sender_id: string;
  content: string;
  image_url: string | null;
  audio_url: string | null;
  created_at: string;
};

type TicketDetailDrawerProps = {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  ticket: TicketRow | null;
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

export function TicketDetailDrawer({
  open,
  onOpenChange,
  ticket,
  zoneName,
  onTicketUpdated,
  onMarkTicketRead,
}: TicketDetailDrawerProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [senderNameMap, setSenderNameMap] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [statusDraft, setStatusDraft] = useState<TicketStatus | "">("");
  const [activeTab, setActiveTab] = useState<"details" | "followup">("details");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const [attachmentImageFile, setAttachmentImageFile] = useState<File | null>(null);
  const [attachmentAudioFile, setAttachmentAudioFile] = useState<File | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<string | null>(null);

  const ticketId = ticket?.id;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStatusDraft(ticket?.status ?? "");
    setActiveTab("details");
  }, [ticket?.id, ticket?.status]);

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

  const loadMessages = async () => {
    if (!ticketId) return;

    const { data, error } = await supabase
      .from("ticket_messages")
      .select("id, ticket_id, sender_id, content, image_url, audio_url, created_at")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true });

    if (error) {
      toast.error(error.message);
      return;
    }

    const chatRows = (data as ChatMessage[]) ?? [];
    setMessages(chatRows);

    if (chatRows.length > 0) {
      const latest = chatRows[chatRows.length - 1]?.created_at ?? new Date().toISOString();
      onMarkTicketRead(ticketId, latest);
    } else {
      onMarkTicketRead(ticketId, new Date().toISOString());
    }

    const senderIds = Array.from(
      new Set([
        ...chatRows.map((row) => row.sender_id),
        ...(ticket?.assigned_engineer_id ? [ticket.assigned_engineer_id] : []),
      ]),
    );
    if (senderIds.length === 0) return;

    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", senderIds);

    if (profilesError) {
      return;
    }

    const map: Record<string, string> = {};
    (profiles ?? []).forEach((profile) => {
      map[profile.id] = profile.full_name;
    });
    setSenderNameMap(map);
  };

  useEffect(() => {
    if (!open || !ticketId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadMessages();
  }, [open, ticketId]);

  useEffect(() => {
    if (!open || !ticketId) return;

    const channel = supabase
      .channel(`ticket-chat-${ticketId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "ticket_messages",
          filter: `ticket_id=eq.${ticketId}`,
        },
        () => {
          void loadMessages();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "tickets",
          filter: `id=eq.${ticketId}`,
        },
        async () => {
          await onTicketUpdated();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [open, ticketId, onTicketUpdated]);

  const sendMessage = async () => {
    if (!ticketId) return;
    const content = draft.trim();
    if (!content && !attachmentImageFile && !attachmentAudioFile) return;

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      toast.error("يرجى تسجيل الدخول مرة أخرى.");
      return;
    }

    setSending(true);
    let imageUrl: string | null = null;
    let audioUrl: string | null = null;

    if (attachmentImageFile) {
      setUploadingImage(true);
      const ext = attachmentImageFile.name.split(".").pop() ?? "jpg";
      const filePath = `${ticketId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("ticket-message-attachments")
        .upload(filePath, attachmentImageFile, { upsert: false });

      setUploadingImage(false);

      if (uploadError) {
        toast.error("فشل رفع الصورة. تأكد من وجود bucket باسم ticket-message-attachments.");
        setSending(false);
        return;
      }

      const { data: publicData } = supabase.storage.from("ticket-message-attachments").getPublicUrl(filePath);
      imageUrl = publicData.publicUrl;
    }

    if (attachmentAudioFile) {
      setUploadingAudio(true);
      const ext = attachmentAudioFile.name.split(".").pop() ?? "webm";
      const filePath = `${ticketId}/voice-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: uploadAudioError } = await supabase.storage
        .from("ticket-message-attachments")
        .upload(filePath, attachmentAudioFile, { upsert: false });
      setUploadingAudio(false);

      if (uploadAudioError) {
        toast.error("فشل رفع الرسالة الصوتية.");
        setSending(false);
        return;
      }

      const { data: publicAudioData } = supabase.storage.from("ticket-message-attachments").getPublicUrl(filePath);
      audioUrl = publicAudioData.publicUrl;
    }

    const { error } = await supabase.from("ticket_messages").insert({
      ticket_id: ticketId,
      sender_id: user.id,
      content: content || (audioUrl ? "رسالة صوتية" : "مرفق صورة"),
      image_url: imageUrl,
      audio_url: audioUrl,
    });

    if (error) {
      toast.error(error.message);
      setSending(false);
      return;
    }

    setDraft("");
    setAttachmentImageFile(null);
    setAttachmentAudioFile(null);
    setSending(false);
  };

  const claimTask = async () => {
    if (!ticketId) return;
    setStatusUpdating(true);
    const { error } = await supabase.rpc("claim_ticket", { p_ticket_id: ticketId });
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

  const title = useMemo(() => {
    if (!ticket) return "تفاصيل البلاغ";
    return `بلاغ ${ticket.id.slice(0, 8)}`;
  }, [ticket]);
  const canUpdateStatus = myRole === "admin" || myRole === "supervisor" || myRole === "technician";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent dir="rtl">
        {ticket ? (
          <div className="flex h-full flex-col">
            <SheetHeader>
              <SheetTitle>{title}</SheetTitle>
              <SheetDescription>تفاصيل البلاغ كاملة مع تحديثات المحادثة المباشرة.</SheetDescription>
            </SheetHeader>

            <div className="mb-3 flex items-center gap-2">
              <button
                className={`rounded-md px-3 py-1.5 text-sm ${activeTab === "details" ? "bg-slate-900 text-white" : "border border-slate-200 text-slate-700"}`}
                onClick={() => setActiveTab("details")}
              >
                تفاصيل البلاغ
              </button>
              <button
                className={`rounded-md px-3 py-1.5 text-sm ${activeTab === "followup" ? "bg-slate-900 text-white" : "border border-slate-200 text-slate-700"}`}
                onClick={() => setActiveTab("followup")}
              >
                المتابعة الفورية
              </button>
            </div>

            {activeTab === "details" ? (
              <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm"><span className="font-medium">الموقع:</span> {ticket.location}</p>
                <p className="text-sm"><span className="font-medium">المنطقة:</span> {zoneName || "-"}</p>
                <p className="text-sm"><span className="font-medium">الوصف:</span> {ticket.description}</p>
                <p className="text-sm">
                  <span className="font-medium">المهندس المسؤول حالياً:</span>{" "}
                  {ticket.assigned_engineer_id
                    ? senderNameMap[ticket.assigned_engineer_id] ?? ticket.assigned_engineer_id.slice(0, 8)
                    : "غير محدد"}
                </p>

                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium">الحالة:</span>
                  <Badge variant={statusBadgeVariant(ticket.status)}>{statusLabel(ticket.status)}</Badge>
                </div>

                {canUpdateStatus ? (
                  <div className="flex items-center gap-2">
                    <select
                      className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                      value={statusDraft}
                      onChange={(e) => setStatusDraft(e.target.value as TicketStatus)}
                    >
                      {STATUS_OPTIONS.map((status) => (
                        <option key={status} value={status}>{statusLabel(status)}</option>
                      ))}
                    </select>
                    <Button onClick={() => void updateStatus()} disabled={statusUpdating || statusDraft === ticket.status}>
                      {statusUpdating ? "جاري التحديث..." : "تحديث"}
                    </Button>
                  </div>
                ) : null}

                {myRole === "engineer" ? (
                  <Button
                    onClick={() => void claimTask()}
                    disabled={statusUpdating || ticket.assigned_engineer_id === myUserId}
                  >
                    {ticket.assigned_engineer_id === myUserId ? "تم الاستلام" : "استلام المهمة"}
                  </Button>
                ) : null}
              </div>
            ) : (
              <div className="mt-1 flex-1 rounded-lg border border-slate-200 p-3">
                <h3 className="mb-3 text-sm font-semibold">المتابعة الفورية للبلاغ</h3>
                <div className="h-[320px] space-y-2 overflow-y-auto rounded-md bg-slate-50 p-2">
                  {messages.map((msg) => (
                    <div key={msg.id} className="rounded-md border border-slate-200 bg-white p-2 text-sm">
                      <p className="text-xs text-slate-500">
                        {senderNameMap[msg.sender_id] ?? msg.sender_id.slice(0, 8)} - {new Date(msg.created_at).toLocaleString()}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap">{msg.content}</p>
                      {msg.image_url ? (
                        <a href={msg.image_url} target="_blank" rel="noreferrer" className="mt-2 block">
                          <img src={msg.image_url} alt="صورة الدليل" className="max-h-48 rounded-md border border-slate-200" />
                        </a>
                      ) : null}
                      {msg.audio_url ? (
                        <audio className="mt-2 w-full" controls preload="none" src={msg.audio_url}>
                          متصفحك لا يدعم تشغيل الصوت.
                        </audio>
                      ) : null}
                    </div>
                  ))}
                  {messages.length === 0 ? (
                    <p className="p-2 text-sm text-slate-500">لا توجد تعليقات حتى الآن.</p>
                  ) : null}
                </div>

                <div className="mt-3 space-y-2">
                  <Textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="اكتب رسالتك هنا.."
                  />
                  <div className="space-y-1">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setAttachmentImageFile(e.target.files?.[0] ?? null)}
                      className="block w-full text-xs"
                    />
                    <input
                      type="file"
                      accept="audio/*"
                      onChange={(e) => setAttachmentAudioFile(e.target.files?.[0] ?? null)}
                      className="block w-full text-xs"
                    />
                    {attachmentImageFile ? <p className="text-xs text-slate-500">الصورة: {attachmentImageFile.name}</p> : null}
                    {attachmentAudioFile ? <p className="text-xs text-slate-500">الصوت: {attachmentAudioFile.name}</p> : null}
                    {uploadingImage ? <p className="text-xs text-slate-500">جاري رفع الصورة...</p> : null}
                    {uploadingAudio ? <p className="text-xs text-slate-500">جاري رفع الصوت...</p> : null}
                  </div>
                  <Button onClick={() => void sendMessage()} disabled={sending}>
                    {sending ? "جاري الكتابة..." : "إرسال الرسالة"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}