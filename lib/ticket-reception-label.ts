import type { TicketStatus } from "@/lib/ticket-status";

export type TicketHandlerJoins = {
  status: TicketStatus;
  assigned_technician?: { full_name: string } | null;
  assigned_supervisor?: { full_name: string } | null;
  assigned_engineer?: { full_name: string } | null;
  closed_by_profile?: { full_name: string } | null;
};

/** المسؤول الحالي: فني ثم مشرف ثم مهندس ثم مُغلق البلاغ (عند غياب التعيينات) */
export function primaryTicketHandlerName(ticket: TicketHandlerJoins): string | null {
  const t = ticket.assigned_technician?.full_name?.trim();
  if (t) return t;
  const s = ticket.assigned_supervisor?.full_name?.trim();
  if (s) return s;
  const e = ticket.assigned_engineer?.full_name?.trim();
  if (e) return e;
  const c = ticket.closed_by_profile?.full_name?.trim();
  if (c) return c;
  return null;
}

export type ReceptionUi =
  | { kind: "waiting" }
  | { kind: "named"; name: string }
  | { kind: "unassigned" };

export function ticketReceptionUi(ticket: TicketHandlerJoins): ReceptionUi {
  if (ticket.status === "not_received") {
    return { kind: "waiting" };
  }
  const name = primaryTicketHandlerName(ticket);
  if (name) return { kind: "named", name };
  return { kind: "unassigned" };
}

export function ticketReceptionExportLine(ticket: TicketHandlerJoins): string {
  const ui = ticketReceptionUi(ticket);
  if (ui.kind === "waiting") return "في انتظار الاستلام";
  if (ui.kind === "named") return `تم استلام البلاغ بواسطة: ${ui.name}`;
  return "تم تحديث الحالة — لا موظف مرتبط في السجل";
}
