import { arabicErrorMessage } from "@/lib/arabic-errors";

export type HardDeleteTicketResult =
  | { ok: true }
  | { ok: false; error: string; status: number };

/**
 * حذف بلاغ عبر API الإدارة — يعيد الخطأ الفعلي من الخادم (بما فيها 0 صف محذوف).
 */
export async function hardDeleteTicketViaApi(ticketId: string): Promise<HardDeleteTicketResult> {
  let res: Response;
  try {
    res = await fetch(`/api/admin/tickets/${ticketId}`, { method: "DELETE" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: arabicErrorMessage(msg), status: 0 };
  }

  const text = await res.text();
  let body: { ok?: boolean; error?: string } = {};
  try {
    body = text ? (JSON.parse(text) as { ok?: boolean; error?: string }) : {};
  } catch {
    return {
      ok: false,
      error: arabicErrorMessage(text || res.statusText || "رد غير صالح من الخادم"),
      status: res.status,
    };
  }

  if (!res.ok) {
    const raw = body.error ?? res.statusText ?? "تعذر حذف البلاغ.";
    return { ok: false, error: arabicErrorMessage(raw), status: res.status };
  }
  if (body.ok !== true) {
    const raw = body.error ?? "لم يُؤكَّد حذف البلاغ في الخادم.";
    return { ok: false, error: arabicErrorMessage(raw), status: res.status };
  }

  return { ok: true };
}
