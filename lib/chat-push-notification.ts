import { Howl } from "howler";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";

const CHAT_SOUND_SRC = "/notification-sound.mp3";
const DEDUPE_MS = 2500;
const recentIds = new Map<string, number>();

let chatHowl: Howl | null = null;
let lastChatPlay = 0;
const CHAT_DEBOUNCE_MS = 400;

function pruneRecent(now: number) {
  for (const [id, t] of recentIds) {
    if (now - t > DEDUPE_MS) recentIds.delete(id);
  }
}

function shouldNotifyMessage(messageId: number | string): boolean {
  const key = String(messageId);
  const now = Date.now();
  pruneRecent(now);
  const prev = recentIds.get(key);
  if (prev && now - prev < DEDUPE_MS) return false;
  recentIds.set(key, now);
  return true;
}

export function playChatNotificationSound() {
  if (typeof window === "undefined") return;
  const now = Date.now();
  if (now - lastChatPlay < CHAT_DEBOUNCE_MS) return;
  lastChatPlay = now;

  if (!chatHowl) {
    chatHowl = new Howl({
      src: [CHAT_SOUND_SRC],
      loop: false,
      volume: 0.9,
      html5: true,
    });
  }
  chatHowl.stop();
  chatHowl.play();
}

export function vibrateChatAlert() {
  if (typeof navigator === "undefined" || !navigator.vibrate) return;
  try {
    navigator.vibrate([200, 100, 200, 100, 200]);
  } catch {
    /* ignore */
  }
}

const senderNameCache = new Map<string, string>();

async function resolveSenderName(senderId: string): Promise<string> {
  const hit = senderNameCache.get(senderId);
  if (hit) return hit;
  const { data } = await supabase.from("profiles").select("full_name").eq("id", senderId).maybeSingle();
  const name = (data?.full_name as string | undefined)?.trim() || senderId.slice(0, 8);
  senderNameCache.set(senderId, name);
  return name;
}

export type ChatPushParams = {
  messageId: number | string;
  senderId: string;
  content: string;
  ticketId: string;
  /** رابط عند النقر على الإشعار */
  navigateUrl?: string;
};

/**
 * صوت + اهتزاز + Toast + Web Push (عبر Service Worker) لرسالة دردشة واردة.
 */
export async function notifyNewChatMessage(params: ChatPushParams): Promise<void> {
  if (!shouldNotifyMessage(params.messageId)) return;

  const name = await resolveSenderName(params.senderId);
  const body = params.content.trim().slice(0, 160) || "رسالة جديدة.";

  playChatNotificationSound();
  vibrateChatAlert();

  toast.message(name, { description: body });

  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted" || !("serviceWorker" in navigator)) return;

  const registration = await navigator.serviceWorker.ready;
  const tag = `chat-msg-${params.ticketId}-${String(params.messageId)}-${Date.now()}`;
  registration.active?.postMessage({
    type: "SHOW_NOTIFICATION",
    title: name,
    options: {
      body,
      tag,
      renotify: true,
      vibrate: [200, 100, 200, 100, 200],
      data: {
        url: params.navigateUrl ?? "/tasks/my-work",
        ticketId: params.ticketId,
      },
    },
  });
}
