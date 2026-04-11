"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { formatSaudiTime } from "@/lib/saudi-time";
import { isTicketSystemDocChatMessage } from "@/lib/ticket-task-doc-message";
import { cn } from "@/lib/utils";
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
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const loadMe = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setMyUserId(user?.id ?? null);
    };
    void loadMe();
  }, []);

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

  useLayoutEffect(() => {
    const el = scrollAreaRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, ticketId]);

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
    if (!content) return;

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      toast.error("يرجى تسجيل الدخول مرة أخرى.");
      return;
    }

    setSending(true);
    const { error } = await supabase.from("ticket_messages").insert({
      ticket_id: ticketId,
      sender_id: user.id,
      content,
      image_url: null,
      audio_url: null,
    });

    if (error) {
      toast.error(error.message);
      setSending(false);
      return;
    }

    setDraft("");
    setSending(false);
    void loadMessages();
  };

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 shadow-sm dark:border-slate-700">
      <h3 className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
        الدردشة والتوثيق
      </h3>
      <div
        ref={scrollAreaRef}
        className="max-h-80 space-y-3 overflow-y-auto overflow-x-hidden bg-gradient-to-b from-slate-100/90 to-slate-50 p-3 dark:from-slate-900 dark:to-slate-950"
      >
        {messages.map((msg) => {
          const systemDoc = isTicketSystemDocChatMessage(msg.content);
          if (systemDoc) {
            return (
              <div key={msg.id} className="px-2 py-1 text-center">
                <p className="text-xs italic leading-relaxed text-slate-500 dark:text-slate-400">{msg.content}</p>
                <p className="mt-1 text-[10px] tabular-nums text-slate-400">{formatSaudiTime(msg.created_at)}</p>
              </div>
            );
          }

          const mine = msg.sender_id === myUserId;
          return (
            <div key={msg.id} className={cn("flex w-full", mine ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[88%] rounded-2xl px-3 py-2 text-sm shadow-sm ring-1 ring-black/5",
                  mine
                    ? "rounded-br-md bg-emerald-600 text-white"
                    : "rounded-bl-md bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100",
                )}
              >
                <p className={cn("text-[11px] font-medium leading-tight", mine ? "text-emerald-100" : "text-slate-500")}>
                  {senderNameMap[msg.sender_id] ?? msg.sender_id.slice(0, 8)}
                  {!mine ? (
                    <span className="text-slate-400"> · {senderRoleMap[msg.sender_id] ?? "—"}</span>
                  ) : null}
                </p>
                <p className={cn("mt-1 whitespace-pre-wrap leading-relaxed", mine && "text-white")}>{msg.content}</p>
                {msg.image_url ? (
                  <a href={msg.image_url} target="_blank" rel="noreferrer" className="mt-2 block">
                    <img
                      src={msg.image_url}
                      alt=""
                      className={cn("max-h-40 rounded-lg border object-cover", mine ? "border-emerald-500/50" : "border-slate-200")}
                    />
                  </a>
                ) : null}
                {msg.audio_url ? (
                  <audio
                    className={cn("mt-2 w-full", mine && "[&::-webkit-media-controls-panel]:bg-emerald-700")}
                    controls
                    preload="none"
                    src={msg.audio_url}
                  />
                ) : null}
                <p className={cn("mt-1.5 text-[10px] tabular-nums", mine ? "text-emerald-200/90" : "text-slate-400")}>
                  {formatSaudiTime(msg.created_at)}
                </p>
              </div>
            </div>
          );
        })}
        {messages.length === 0 ? <p className="p-2 text-center text-sm text-slate-500">لا توجد رسائل بعد.</p> : null}
      </div>
      {canPost ? (
        <div className="border-t border-slate-200 bg-white p-3 shadow-[0_-4px_14px_rgba(15,23,42,0.06)] dark:border-slate-700 dark:bg-slate-900">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="رسالة ميدانية / توثيق إجراء / ملاحظة إدارة المشروع… (المرفقات من صندوق المرفقات أعلاه)"
            className="min-h-[72px] rounded-xl border-2 border-slate-200 bg-white shadow-sm transition focus-visible:border-emerald-500 focus-visible:ring-emerald-500/20 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
          />
          <Button className="mt-2 w-full" onClick={() => void sendMessage()} disabled={sending}>
            {sending ? "جاري الإرسال..." : "إرسال"}
          </Button>
        </div>
      ) : (
        <p className="p-3 text-sm text-slate-500">يمكنك معاينة المحادثة فقط.</p>
      )}
    </div>
  );
}
