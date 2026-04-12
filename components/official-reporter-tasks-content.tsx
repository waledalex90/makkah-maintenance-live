"use client";

/**
 * واجهة «مهام المسؤول عن البلاغات» — منفصلة عن قائمة مهام الميدان (TechnicianWorkList).
 * تبويبات زمنية + تنبيهات عند دخول بلاغات للشروط أو إغلاق بلاغ.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { arabicErrorMessage } from "@/lib/arabic-errors";
import { formatRelativeSmartAr, formatSaudiNow, getAgeMs } from "@/lib/saudi-time";
import { playWorkNotificationSound } from "@/lib/work-notification";
import { statusLabelAr } from "@/lib/ticket-status";
import type { TicketStatus } from "@/lib/ticket-status";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const PICKUP_SLACK_MINUTES = 2;
const EXEC_DELAY_MINUTES = 40;

type CategoryJoin = { name: string } | { name: string }[] | null;

type OfficialTicketRow = {
  id: string;
  ticket_number?: number | null;
  external_ticket_number?: string | null;
  reporter_name?: string | null;
  title?: string | null;
  ticket_categories?: CategoryJoin;
  status: TicketStatus;
  zone_id: string | null;
  created_at: string;
  received_at?: string | null;
  updated_at?: string | null;
};

type FollowupRow = {
  id: string;
  ticket_id: string;
  user_id: string;
  is_working: boolean;
  dismissed_at: string | null;
};

type OfficialTab = "not_received" | "delay" | "finished";

function normalizeCategoryName(category: CategoryJoin | undefined): string {
  if (!category) return "-";
  if (Array.isArray(category)) return category[0]?.name ?? "-";
  return category.name;
}

function sortOldestFirst(rows: OfficialTicketRow[]): OfficialTicketRow[] {
  return [...rows].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}

function sinceReceivedIso(t: OfficialTicketRow): string | null {
  return t.received_at ?? t.updated_at ?? null;
}

export function OfficialReporterTasksContent() {
  const router = useRouter();
  const [tickets, setTickets] = useState<OfficialTicketRow[]>([]);
  const [followups, setFollowups] = useState<FollowupRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [nowTs, setNowTs] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [tab, setTab] = useState<OfficialTab>("not_received");
  const prevAlertSetsRef = useRef<{ t1: Set<string>; t2: Set<string> } | null>(null);
  const hydratedRef = useRef(false);

  const loadData = useCallback(async () => {
    const [tRes, fRes] = await Promise.all([
      supabase
        .from("tickets")
        .select(
          "id, ticket_number, external_ticket_number, reporter_name, title, category_id, ticket_categories(name), status, zone_id, created_at, received_at, updated_at",
        )
        .order("created_at", { ascending: false }),
      supabase.from("reporter_ticket_followups").select("id, ticket_id, user_id, is_working, dismissed_at"),
    ]);

    if (tRes.error) {
      toast.error(arabicErrorMessage(tRes.error.message));
    } else {
      setTickets((tRes.data as OfficialTicketRow[]) ?? []);
    }
    if (fRes.error) {
      toast.error(arabicErrorMessage(fRes.error.message));
    } else {
      setFollowups((fRes.data as FollowupRow[]) ?? []);
    }

    const fRows = (fRes.data as FollowupRow[]) ?? [];
    const userIds = [...new Set(fRows.filter((r) => r.is_working).map((r) => r.user_id))];
    if (userIds.length > 0) {
      const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", userIds);
      const map: Record<string, string> = {};
      (profs ?? []).forEach((p: { id: string; full_name: string }) => {
        map[p.id] = p.full_name;
      });
      setProfiles(map);
    } else {
      setProfiles({});
    }
  }, []);

  useEffect(() => {
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setMyUserId(user?.id ?? null);
      if (!user?.id) {
        setMyRole(null);
        return;
      }
      const { data: prof } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
      setMyRole((prof as { role?: string } | null)?.role ?? null);
    })();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNowTs(Date.now()), 10_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setLoading(true);
    void loadData().finally(() => setLoading(false));
  }, [loadData]);

  useEffect(() => {
    const channel = supabase
      .channel("official-reporter-tasks-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "tickets" }, (payload) => {
        if (payload.eventType === "UPDATE") {
          const oldRow = payload.old as { status?: TicketStatus };
          const newRow = payload.new as { status?: TicketStatus };
          if (oldRow.status !== "finished" && newRow.status === "finished") {
            playWorkNotificationSound();
            toast.success("تم إغلاق بلاغ في النظام.");
          }
        }
        void loadData();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "reporter_ticket_followups" }, () => {
        void loadData();
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadData]);

  const dismissedIds = useMemo(() => {
    if (!myUserId) return new Set<string>();
    const s = new Set<string>();
    followups.forEach((f) => {
      if (f.user_id === myUserId && f.dismissed_at) s.add(f.ticket_id);
    });
    return s;
  }, [followups, myUserId]);

  const workingNamesByTicket = useMemo(() => {
    const m = new Map<string, string[]>();
    followups.forEach((f) => {
      if (!f.is_working) return;
      const name = profiles[f.user_id] ?? f.user_id.slice(0, 8);
      const arr = m.get(f.ticket_id) ?? [];
      arr.push(name);
      m.set(f.ticket_id, arr);
    });
    return m;
  }, [followups, profiles]);

  const { tabNotReceived, tabDelay, tabFinished } = useMemo(() => {
    const open = tickets.filter((t) => !dismissedIds.has(t.id));
    const t1 = sortOldestFirst(
      open.filter((t) => t.status === "not_received" && getAgeMs(t.created_at, nowTs) > PICKUP_SLACK_MINUTES * 60_000),
    );
    const t2 = sortOldestFirst(
      open.filter((t) => {
        if (t.status !== "received") return false;
        const refIso = sinceReceivedIso(t);
        if (!refIso) return false;
        return getAgeMs(refIso, nowTs) > EXEC_DELAY_MINUTES * 60_000;
      }),
    );
    const t3 = sortOldestFirst(open.filter((t) => t.status === "finished"));
    return { tabNotReceived: t1, tabDelay: t2, tabFinished: t3 };
  }, [tickets, dismissedIds, nowTs]);

  useEffect(() => {
    const s1 = new Set(tabNotReceived.map((t) => t.id));
    const s2 = new Set(tabDelay.map((t) => t.id));
    if (!hydratedRef.current) {
      hydratedRef.current = true;
      prevAlertSetsRef.current = { t1: s1, t2: s2 };
      return;
    }
    const prev = prevAlertSetsRef.current;
    if (!prev) {
      prevAlertSetsRef.current = { t1: s1, t2: s2 };
      return;
    }
    for (const id of s1) {
      if (!prev.t1.has(id)) {
        playWorkNotificationSound();
        toast.warning("تنبيه: بلاغ لم يُستلم وتجاوز دقيقتين.", { description: "راجع تبويب «لم يتم الاستلام»." });
        break;
      }
    }
    for (const id of s2) {
      if (!prev.t2.has(id)) {
        playWorkNotificationSound();
        toast.warning("تنبيه: تأخير تنفيذ — بلاغ منذ الاستلام أكثر من ٤٠ دقيقة.", {
          description: "راجع تبويب «تأخير تنفيذ».",
        });
        break;
      }
    }
    prevAlertSetsRef.current = { t1: s1, t2: s2 };
  }, [tabNotReceived, tabDelay]);

  const toggleWorking = async (ticketId: string) => {
    if (!myUserId) {
      toast.error("تعذر التحقق من المستخدم.");
      return;
    }
    setActingId(ticketId);
    try {
      const existing = followups.find((f) => f.ticket_id === ticketId && f.user_id === myUserId);
      const next = !existing?.is_working;
      if (existing) {
        const { error } = await supabase
          .from("reporter_ticket_followups")
          .update({ is_working: next })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("reporter_ticket_followups").insert({
          ticket_id: ticketId,
          user_id: myUserId,
          is_working: true,
        });
        if (error) throw error;
      }
      toast.success(next ? "يُعرض لزملائك أنك تتابع هذا البلاغ." : "تم إيقاف وضع المتابعة لهذا البلاغ.");
      await loadData();
    } catch (e) {
      toast.error(e instanceof Error ? arabicErrorMessage(e.message) : "تعذر حفظ الحالة.");
    } finally {
      setActingId(null);
    }
  };

  const markDone = async (ticketId: string) => {
    if (!myUserId) return;
    if (!window.confirm("تأكيد إزالة هذه المهمة من قائمتك بعد المتابعة؟")) return;
    setActingId(ticketId);
    try {
      const existing = followups.find((f) => f.ticket_id === ticketId && f.user_id === myUserId);
      const iso = new Date().toISOString();
      if (existing) {
        const { error } = await supabase
          .from("reporter_ticket_followups")
          .update({ dismissed_at: iso, is_working: false })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("reporter_ticket_followups").insert({
          ticket_id: ticketId,
          user_id: myUserId,
          is_working: false,
          dismissed_at: iso,
        });
        if (error) throw error;
      }
      toast.success("تمت أرشفة المهمة من قائمتك.");
      await loadData();
    } catch (e) {
      toast.error(e instanceof Error ? arabicErrorMessage(e.message) : "تعذر الإكمال.");
    } finally {
      setActingId(null);
    }
  };

  const myWorking = (ticketId: string) =>
    Boolean(followups.find((f) => f.ticket_id === ticketId && f.user_id === myUserId && f.is_working));

  const ticketLabel = (t: OfficialTicketRow) =>
    String(t.external_ticket_number ?? t.ticket_number ?? t.id.slice(0, 8));

  const showReporterFollowupControls = myRole === "reporter";

  const visibleRows =
    tab === "not_received" ? tabNotReceived : tab === "delay" ? tabDelay : tabFinished;

  const renderTable = () => {
    if (visibleRows.length === 0) {
      return <p className="py-6 text-center text-sm text-slate-500">لا توجد عناصر في هذا التبويب حاليًا.</p>;
    }

    return (
      <div className="overflow-x-auto rounded-lg border border-slate-200/80 bg-white">
        <table className="min-w-full text-right text-sm">
          <thead className="border-b border-slate-200 bg-slate-50/90 text-slate-700">
            <tr>
              <th className="px-3 py-2 font-semibold">رقم البلاغ</th>
              <th className="px-3 py-2 font-semibold">التصنيف</th>
              <th className="px-3 py-2 font-semibold">الحالة</th>
              <th className="px-3 py-2 font-semibold">منذ الإنشاء</th>
              {tab === "delay" ? <th className="px-3 py-2 font-semibold">منذ الاستلام</th> : null}
              {tab !== "finished" ? <th className="px-3 py-2 font-semibold">متابعة من الفريق</th> : null}
              <th className="px-3 py-2 font-semibold">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((t) => {
              const workers = workingNamesByTicket.get(t.id)?.join("، ") ?? "—";
              const busy = actingId === t.id;
              const refReceived = sinceReceivedIso(t);
              return (
                <tr key={`${tab}-${t.id}`} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-2 font-medium text-slate-900">{ticketLabel(t)}</td>
                  <td className="px-3 py-2 text-slate-600">{normalizeCategoryName(t.ticket_categories)}</td>
                  <td className="px-3 py-2">
                    <Badge variant="muted">{statusLabelAr(t.status)}</Badge>
                  </td>
                  <td className="px-3 py-2 text-slate-600" title={t.created_at}>
                    {formatRelativeSmartAr(t.created_at, nowTs)}
                  </td>
                  {tab === "delay" ? (
                    <td className="px-3 py-2 text-slate-600" title={refReceived ?? ""}>
                      {refReceived ? formatRelativeSmartAr(refReceived, nowTs) : "—"}
                    </td>
                  ) : null}
                  {tab !== "finished" ? <td className="px-3 py-2 text-xs text-slate-600">{workers}</td> : null}
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {showReporterFollowupControls && tab !== "finished" ? (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="border-sky-300 bg-sky-50 text-sky-900 hover:bg-sky-100"
                            disabled={busy}
                            onClick={() => void toggleWorking(t.id)}
                          >
                            {myWorking(t.id) ? "إيقاف المتابعة" : "جاري العمل"}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="border-slate-200"
                            disabled={busy}
                            onClick={() => void markDone(t.id)}
                          >
                            تم الانتهاء
                          </Button>
                        </>
                      ) : null}
                      <Link
                        href={`/dashboard/tickets?open=${t.id}`}
                        className={cn(
                          buttonVariants({ variant: "outline", size: "sm" }),
                          "border-transparent text-sky-800 hover:bg-sky-50",
                        )}
                      >
                        فتح البلاغ
                      </Link>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-600" dir="rtl" lang="ar">
        جاري تحميل المهام…
      </div>
    );
  }

  const tabBtn = (id: OfficialTab, label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => setTab(id)}
      className={`min-h-11 flex-1 rounded-md px-2 py-2 text-sm font-semibold transition ${
        tab === id ? "bg-slate-900 text-white shadow" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-6 bg-white text-slate-900" dir="rtl" lang="ar" style={{ colorScheme: "light" }}>
      <header className="flex flex-col gap-2 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">مهامي — مسؤول البلاغات</h1>
          <p className="mt-1 text-sm text-slate-600">
            {myRole === "admin"
              ? "نظرة زمنية على البلاغات (صلاحية الرؤية حسب سياسة النظام)."
              : "تبويبات زمنية للمتابعة — التوقيت المرجعي: مكة المكرمة (GMT+٣)."}
          </p>
          <p className="mt-1 text-xs text-slate-500" suppressHydrationWarning>
            التوقيت الحالي: {formatSaudiNow(nowTs)}
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => router.push("/dashboard/tickets")}>
          الانتقال إلى جدول البلاغات
        </Button>
      </header>

      <Card className="shadow-sm">
        <CardHeader className="space-y-3 pb-2">
          <CardTitle>التبويبات الزمنية</CardTitle>
          <div className="flex flex-wrap gap-2">
            {tabBtn("not_received", "لم يتم الاستلام")}
            {tabBtn("delay", "تأخير تنفيذ")}
            {tabBtn("finished", "المنتهية")}
          </div>
          <p className="text-xs text-slate-500">
            {tab === "not_received"
              ? "بلاغات بحالة «لم يستلم» وعمرها أكثر من دقيقتين (مقابلة new في المخطط القديم)."
              : tab === "delay"
                ? "بلاغات «تم الاستلام» ومضى على الاستلام أكثر من ٤٠ دقيقة (مقابلة assigned مع تأخير)."
                : "بلاغات منتهية في النظام (مقابلة completed)."}
          </p>
        </CardHeader>
        <CardContent>{renderTable()}</CardContent>
      </Card>
    </div>
  );
}
