"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { motion, useDragControls } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StorageMediaPreview } from "@/components/storage-media-preview";
import { statusBadgeVariant, statusLabelAr, type TicketStatus } from "@/lib/ticket-status";
import { formatSaudiDateTime } from "@/lib/saudi-time";

type TicketModalRow = {
  id: string;
  ticket_number?: number | null;
  external_ticket_number?: string | null;
  reporter_name?: string | null;
  reporter_phone?: string | null;
  title?: string | null;
  description: string;
  location?: string | null;
  status: TicketStatus;
  created_at: string;
  closed_at?: string | null;
};

type TicketAttachmentRow = {
  id: number;
  file_url: string;
  file_type?: string | null;
  file_name: string | null;
};

type TaskTicketDetailModalProps = {
  open: boolean;
  ticketId: string | null;
  onOpenChange: (open: boolean) => void;
};

export function TaskTicketDetailModal({ open, ticketId, onOpenChange }: TaskTicketDetailModalProps) {
  const [mounted, setMounted] = useState(false);
  const [ticket, setTicket] = useState<TicketModalRow | null>(null);
  const [attachments, setAttachments] = useState<TicketAttachmentRow[]>([]);
  const [isDesktop, setIsDesktop] = useState(false);
  const dragControls = useDragControls();

  useEffect(() => {
    setMounted(true);
    const media = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !ticketId) return;
    const load = async () => {
      const { data } = await supabase
        .from("tickets")
        .select("id, ticket_number, external_ticket_number, reporter_name, reporter_phone, title, description, location, status, created_at, closed_at")
        .eq("id", ticketId)
        .maybeSingle();
      setTicket((data as TicketModalRow | null) ?? null);

      const { data: att } = await supabase
        .from("ticket_attachments")
        .select("id, file_url, file_type, file_name")
        .eq("ticket_id", ticketId)
        .order("sort_order", { ascending: true })
        .order("id", { ascending: true });
      setAttachments((att as TicketAttachmentRow[] | null) ?? []);
    };
    void load();
  }, [open, ticketId]);

  const title = useMemo(() => {
    if (!ticket) return "تفاصيل البلاغ";
    return ticket.external_ticket_number || (ticket.ticket_number ? `#${ticket.ticket_number}` : ticket.id.slice(0, 8));
  }, [ticket]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[200]">
      <button
        type="button"
        aria-label="إغلاق نافذة البلاغ"
        className="absolute inset-0 bg-black/55"
        onClick={() => onOpenChange(false)}
      />
      <div className="pointer-events-none absolute inset-0 flex items-end justify-center p-0 lg:items-center lg:p-6">
        <motion.div
          drag={isDesktop}
          dragListener={false}
          dragControls={dragControls}
          dragMomentum={false}
          className="pointer-events-auto flex h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl lg:h-[84vh] lg:rounded-2xl"
          initial={isDesktop ? { opacity: 0, y: 24 } : { opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.18 }}
        >
          <div className="flex items-start justify-between border-b border-slate-200 px-4 py-3 lg:px-5">
            <div>
              <h3 className="text-base font-semibold text-slate-900">البلاغ {title}</h3>
              <p className="text-xs text-slate-500">تم الفتح من صفحة المهام بدون إعادة توجيه.</p>
            </div>
            <div className="flex items-center gap-2">
              {isDesktop ? (
                <button
                  type="button"
                  className="cursor-grab rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 active:cursor-grabbing"
                  onPointerDown={(event) => dragControls.start(event)}
                >
                  سحب
                </button>
              ) : null}
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                إغلاق
              </Button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 lg:px-5">
            {ticket ? (
              <div className="space-y-4">
                <div className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                  <p><span className="font-medium">الحالة:</span> <Badge variant={statusBadgeVariant(ticket.status)}>{statusLabelAr(ticket.status)}</Badge></p>
                  <p><span className="font-medium">مقدم البلاغ:</span> {ticket.reporter_name ?? "—"}</p>
                  <p><span className="font-medium">الجوال:</span> {ticket.reporter_phone ?? "—"}</p>
                  <p><span className="font-medium">الموقع:</span> {ticket.title ?? ticket.location ?? "—"}</p>
                  <p><span className="font-medium">الوصف:</span> {ticket.description}</p>
                  <p><span className="font-medium">الإنشاء:</span> {formatSaudiDateTime(ticket.created_at)}</p>
                  {ticket.closed_at ? <p><span className="font-medium">الإغلاق:</span> {formatSaudiDateTime(ticket.closed_at)}</p> : null}
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <h4 className="mb-2 text-sm font-semibold">المرفقات</h4>
                  {attachments.length === 0 ? (
                    <p className="text-xs text-slate-500">لا توجد مرفقات حالياً.</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {attachments.map((att) => (
                        <a key={att.id} href={att.file_url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-slate-200">
                          {att.file_type === "video" ? (
                            <StorageMediaPreview src={att.file_url} alt={att.file_name ?? "video"} type="video" className="h-28 w-full object-cover" />
                          ) : (
                            <StorageMediaPreview src={att.file_url} alt={att.file_name ?? "image"} type="image" className="h-28 w-full object-cover" />
                          )}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">جاري تحميل تفاصيل البلاغ...</p>
            )}
          </div>
        </motion.div>
      </div>
    </div>,
    document.body,
  );
}

