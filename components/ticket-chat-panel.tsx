"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
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

type TicketChatPanelProps = {
  ticketId: string;
  canPost: boolean;
  onTicketUpdated: () => Promise<void>;
  onMarkTicketRead: (ticketId: string, readAt: string) => void;
};

export function TicketChatPanel({ ticketId, canPost, onTicketUpdated, onMarkTicketRead }: TicketChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [senderNameMap, setSenderNameMap] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const [attachmentImageFile, setAttachmentImageFile] = useState<File | null>(null);
  const [attachmentAudioFile, setAttachmentAudioFile] = useState<File | null>(null);

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

    const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", senderIds);
    const map: Record<string, string> = {};
    (profiles ?? []).forEach((p) => {
      map[p.id] = p.full_name;
    });
    setSenderNameMap(map);
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

  const sendMessage = async () => {
    if (!canPost) return;
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
        toast.error("فشل رفع الصورة.");
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
        toast.error("فشل رفع الصوت.");
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
    void loadMessages();
  };

  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-900">مركز التواصل والمرفقات</h3>
      <div className="mb-3 max-h-64 space-y-2 overflow-y-auto rounded-md bg-slate-50 p-2">
        {messages.map((msg) => (
          <div key={msg.id} className="rounded-md border border-slate-200 bg-white p-2 text-sm">
            <p className="text-xs text-slate-500">
              {senderNameMap[msg.sender_id] ?? msg.sender_id.slice(0, 8)} — {new Date(msg.created_at).toLocaleString()}
            </p>
            <p className="mt-1 whitespace-pre-wrap">{msg.content}</p>
            {msg.image_url ? (
              <a href={msg.image_url} target="_blank" rel="noreferrer" className="mt-2 block">
                <img src={msg.image_url} alt="" className="max-h-40 rounded-md border border-slate-200" />
              </a>
            ) : null}
            {msg.audio_url ? <audio className="mt-2 w-full" controls preload="none" src={msg.audio_url} /> : null}
          </div>
        ))}
        {messages.length === 0 ? <p className="p-2 text-sm text-slate-500">لا توجد رسائل بعد.</p> : null}
      </div>
      {canPost ? (
        <>
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="ملاحظة أو مرفق..."
            className="min-h-[72px]"
          />
          <div className="mt-2 space-y-1">
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
          </div>
          <Button className="mt-2 w-full" onClick={() => void sendMessage()} disabled={sending || uploadingImage || uploadingAudio}>
            {sending ? "جاري الإرسال..." : "إرسال"}
          </Button>
        </>
      ) : (
        <p className="text-sm text-slate-500">يمكنك معاينة المحادثة فقط.</p>
      )}
    </div>
  );
}
