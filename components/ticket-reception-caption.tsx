"use client";

import { cn } from "@/lib/utils";
import { ticketReceptionUi, type TicketHandlerJoins } from "@/lib/ticket-reception-label";

type Props = {
  ticket: TicketHandlerJoins;
  className?: string;
};

export function TicketReceptionCaption({ ticket, className }: Props) {
  const ui = ticketReceptionUi(ticket);
  if (ui.kind === "waiting") {
    return <p className={cn("text-xs text-slate-500", className)}>في انتظار الاستلام</p>;
  }
  if (ui.kind === "named") {
    return (
      <p className={cn("text-xs text-slate-500", className)}>
        تم استلام البلاغ بواسطة:{" "}
        <span className="font-medium text-slate-700">{ui.name}</span>
      </p>
    );
  }
  return (
    <p className={cn("text-xs text-slate-500", className)}>
      تم تحديث حالة البلاغ — لم يُربَط موظف بعد في السجل.
    </p>
  );
}
