"use client";

import { useEffect, useState } from "react";
import imageCompression from "browser-image-compression";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { formatSaudiTime } from "@/lib/saudi-time";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type ChatMessage = {
  id: number;
  ticket_id: string;
  sender_id: string;
  content: string;
  image_url: string | null;
  audio_url: string | null;
  created_at: string;
};

type ProfileLite = {
  id: string;
  full_name: string;
  role: string | null;
};

type TicketChatPanelProps = {
  ticketId: string;
  canPost: boolean;
  onTicketUpdated: () => Promise<void>;
  onMarkTicketRead: (ticketId: string, readAt: string) => void;
};

export function TicketChatPanel({ ticketId, canPost, onTicketUpdated, onMarkTicketRead }: TicketChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [senderNameMap, setSenderNameMap] = useState<Record<string, string>>({});
  const [senderRoleMap, setSenderRoleMap] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [attachmentImageFile, setAttachmentImageFile] = useState<File | null>(null);
  const [attachmentAudioFile, setAttachmentAudioFile] = useState<File | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);

  useEffect(() => {
    const loadMe = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setMyUserId(user?.id ?? null);
    };
    void loadMe();
  }, []);

  const compressImage = async (file: File) => {
    return imageCompression(file, {
      maxSizeMB: 1,
      maxWidthOrHeight: 1600,
      useWebWorker: true,
      initialQuality: 0.8,
    });
  };

  const roleLabel = (role: string | null | undefined) => {
    if (!role) return "غير محدد";
    if (role === "admin") return "مدير النظام";
    if (role === "projects_director") return "مدير المشاريع";
    if (role === "project_manager") return "مدير مشروع";
    if (role === "engineer") return "مهندس";
    if (role === "supervisor") return "مشرف";
    if (role === "technician") return "فني";
    if (role === "reporter") return "مدخل بيانات";
    return role;
  };

  const loadMessages = async () => {
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

    const senderIds = Array.from(new Set(chatRows.map((row) => row.sender_id)));
    if (senderIds.length === 0) return;

    const { data: profiles } = await supabase.from("profiles").select("id, full_name, role").in("id", senderIds);
    const map: Record<string, string> = {};
    const roleMap: Record<string, string> = {};
    ((profiles as ProfileLite[]) ?? []).forEach((p) => {
      map[p.id] = p.full_name;
      roleMap[p.id] = roleLabel(p.role);
    });
    setSenderNameMap(map);
    setSenderRoleMap(roleMap);
  };

  useEffect(() => {
    void loadMessages();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId]);

  useEffect(() => {
    const channel = supabase
      .channel(`ticket-chat-panel-${ticketId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "ticket_messages", filter: `ticket_id=eq.${ticketId}` },
        () => void loadMessages(),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "tickets", filter: `id=eq.${ticketId}` },
        () => void onTicketUpdated(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resubscribe on ticketId only; loadMessages closes over ticketId
  }, [ticketId, onTicketUpdated]);

  const sendMessage = async (imageFileOverride?: File | null) => {
    if (!canPost) return;
    const content = draft.trim();
    const chosenImageFile = imageFileOverride ?? attachmentImageFile;
    if (!content && !chosenImageFile && !attachmentAudioFile) return;

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

    if (chosenImageFile) {
      setUploadingImage(true);
      setUploadProgress(8);
      const compressedImage = await compressImage(chosenImageFile);
      setUploadProgress(20);
      const progressTicker = window.setInterval(() => {
        setUploadProgress((prev) => (prev >= 90 ? 90 : prev + 8));
      }, 220);
      const ext = compressedImage.name.split(".").pop() ?? "jpg";
      const filePath = `${ticketId}-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("tickets")
        .upload(filePath, compressedImage, { upsert: false });
      window.clearInterval(progressTicker);
      setUploadingImage(false);
      if (uploadError) {
        setUploadProgress(0);
        toast.error("فشل رفع الصورة.");
        setSending(false);
        return;
      }
      const { data: publicData } = supabase.storage.from("tickets").getPublicUrl(filePath);
      imageUrl = publicData.publicUrl;
      setUploadProgress(100);
    }

    if (attachmentAudioFile) {
      setUploadingAudio(true);
      const ext = attachmentAudioFile.name.split(".").pop() ?? "webm";
      const filePath = `${ticketId}-voice-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: uploadAudioError } = await supabase.storage
        .from("tickets")
        .upload(filePath, attachmentAudioFile, { upsert: false });
      setUploadingAudio(false);
      if (uploadAudioError) {
        toast.error("فشل رفع الصوت.");
        setSending(false);
        return;
      }
      const { data: publicAudioData } = supabase.storage.from("tickets").getPublicUrl(filePath);
      audioUrl = publicAudioData.publicUrl;
    }

    const { data: myProfile } = await supabase.from("profiles").select("full_name, role").eq("id", user.id).single();
    const senderLabel = (myProfile as { full_name?: string; role?: string | null } | null)?.full_name ?? "المستخدم";
    const senderRole = roleLabel((myProfile as { role?: string | null } | null)?.role);

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
    setUploadProgress(0);
    setSending(false);
    void loadMessages();
    if (imageUrl) {
      toast.success(`تم رفع الصورة بواسطة: ${senderLabel} - ${senderRole}`);
    }
  };

  const onImageSelected = (file: File | null) => {
    if (!file) return;
    setAttachmentImageFile(file);
    void sendMessage(file);
  };

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700">
      <h3 className="border-b border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
        الدردشة والتوثيق
      </h3>
      <div className="max-h-72 space-y-2 overflow-y-auto bg-[#e5ddd5] p-3 dark:bg-slate-800">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.sender_id === myUserId ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-xl p-2 text-sm shadow-sm ${
                msg.sender_id === myUserId ? "bg-[#dcf8c6] text-slate-900" : "bg-white text-slate-900"
              }`}
            >
              <p className="text-[11px] text-slate-500">{senderNameMap[msg.sender_id] ?? msg.sender_id.slice(0, 8)}</p>
              <p className="mt-1 whitespace-pre-wrap">{msg.content}</p>
            {msg.image_url ? (
              <>
                <a href={msg.image_url} target="_blank" rel="noreferrer" className="mt-2 block">
                  <img src={msg.image_url} alt="" className="max-h-40 rounded-md border border-slate-200" />
                </a>
                <p className="mt-1 text-[11px] text-slate-500">
                  بواسطة: {senderNameMap[msg.sender_id] ?? msg.sender_id.slice(0, 8)} - {senderRoleMap[msg.sender_id] ?? "غير محدد"}
                </p>
              </>
            ) : null}
            {msg.audio_url ? <audio className="mt-2 w-full" controls preload="none" src={msg.audio_url} /> : null}
              <p className="mt-1 text-[11px] text-slate-500">{formatSaudiTime(msg.created_at)}</p>
            </div>
          </div>
        ))}
        {messages.length === 0 ? <p className="p-2 text-sm text-slate-500">لا توجد رسائل بعد.</p> : null}
      </div>
      {canPost ? (
        <div className="sticky bottom-0 border-t border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="رسالة ميدانية / توثيق إجراء / ملاحظة إدارة المشروع..."
            className="min-h-[72px] bg-white dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
          <div className="mt-2 space-y-1">
            <input
              type="file"
              accept="image/*"
              onChange={(e) => onImageSelected(e.target.files?.[0] ?? null)}
              className="block w-full text-xs"
            />
            <input
              type="file"
              accept="audio/*"
              onChange={(e) => setAttachmentAudioFile(e.target.files?.[0] ?? null)}
              className="block w-full text-xs"
            />
          </div>
          {uploadingImage ? (
            <div className="mt-2">
              <div className="mb-1 text-xs text-slate-500">جاري رفع الصورة... {uploadProgress}%</div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-200"
                  style={{ width: `${Math.max(6, uploadProgress)}%` }}
                />
              </div>
            </div>
          ) : null}
          <Button className="mt-2 w-full" onClick={() => void sendMessage()} disabled={sending || uploadingImage || uploadingAudio}>
            {sending ? "جاري الإرسال..." : "إرسال"}
          </Button>
        </div>
      ) : (
        <p className="p-3 text-sm text-slate-500">يمكنك معاينة المحادثة فقط.</p>
      )}
    </div>
  );
}
