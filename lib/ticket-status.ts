/**
 * حالات البلاغ في قاعدة البيانات (تتطابق مع enum ticket_status).
 */
export type TicketStatus = "not_received" | "received" | "finished";

export const TICKET_STATUS_VALUES: TicketStatus[] = ["not_received", "received", "finished"];

/** بلاغات مفتوحة للمهام والقوائم */
export const OPEN_TICKET_STATUSES: TicketStatus[] = ["not_received", "received"];

export function statusLabelAr(status: TicketStatus): string {
  if (status === "not_received") return "لم يستلم";
  if (status === "received") return "تم الاستلام";
  return "تم الانتهاء";
}

export function statusBadgeVariant(status: TicketStatus): "red" | "yellow" | "green" | "muted" {
  if (status === "not_received") return "red";
  if (status === "received") return "yellow";
  if (status === "finished") return "green";
  return "muted";
}

export function statusDotClass(status: TicketStatus): string {
  if (status === "not_received") return "bg-red-500";
  if (status === "received") return "bg-amber-400";
  return "bg-emerald-500";
}

export function mapLegacyStatus(raw: string | null | undefined): TicketStatus | null {
  if (!raw) return null;
  if (raw === "not_received" || raw === "received" || raw === "finished") return raw;
  if (raw === "new") return "not_received";
  if (raw === "fixed") return "finished";
  if (raw === "assigned" || raw === "on_the_way" || raw === "arrived") return "received";
  return null;
}
