const STORAGE_KEY = "makkah_work_ticket_chat_read_v1";

function safeParse(raw: string | null): Record<string, string> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== "object") return {};
    return v as Record<string, string>;
  } catch {
    return {};
  }
}

export function readWorkTicketChatReadMap(): Record<string, string> {
  if (typeof window === "undefined") return {};
  return safeParse(window.localStorage.getItem(STORAGE_KEY));
}

export function writeWorkTicketChatReadMap(map: Record<string, string>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore quota */
  }
}

export function setWorkTicketChatReadAt(ticketId: string, readAtIso: string) {
  const next = { ...readWorkTicketChatReadMap(), [ticketId]: readAtIso };
  writeWorkTicketChatReadMap(next);
}
