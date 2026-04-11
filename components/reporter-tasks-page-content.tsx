"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { arabicErrorMessage } from "@/lib/arabic-errors";
import {
  formatSaudiNow,
  getAgeMinutes,
  remainingProcessingWindowCountdownAr,
} from "@/lib/saudi-time";
import { statusLabelAr } from "@/lib/ticket-status";
import type { TicketStatus } from "@/lib/ticket-status";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const PICKUP_SLACK_MINUTES = 2;
const TIMELINE_NOTICE_MINUTES = 40;

type CategoryJoin = { name: string } | { name: string }[] | null;

type TicketRow = {
  id: string;
  ticket_number?: number | null;
  external_ticket_number?: string | null;
  reporter_name?: string | null;
  title?: string | null;
  ticket_categories?: CategoryJoin;
  status: TicketStatus;
  zone_id: string | null;
  created_at: string;
};

type FollowupRow = {
  id: string;
  ticket_id: string;
  user_id: string;
  is_working: boolean;
  dismissed_at: string | null;
};

function normalizeCategoryName(category: CategoryJoin | undefined): string {
  if (!category) return "-";
  if (Array.isArray(category)) return category[0]?.name ?? "-";
  return category.name;
}

function sortOldestFirst(rows: TicketRow[]): TicketRow[] {
  return [...rows].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}

export function ReporterTasksPageContent() {
  const router = useRouter();
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [followups, setFollowups] = useState<FollowupRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [nowTs, setNowTs] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const [tRes, fRes] = await Promise.all([
      supabase
        .from("tickets")
        .select(
          "id, ticket_number, external_ticket_number, reporter_name, title, category_id, ticket_categories(name), status, zone_id, created_at",
        )
        .order("created_at", { ascending: false }),
      supabase.from("reporter_ticket_followups").select("id, ticket_id, user_id, is_working, dismissed_at"),
    ]);

    if (tRes.error) {
      toast.error(arabicErrorMessage(tRes.error.message));
    } else {
      setTickets((tRes.data as TicketRow[]) ?? []);
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
      .channel("reporter-tasks-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "tickets" }, () => {
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

  const { followUpRows, timelineRows, externalRows } = useMemo(() => {
    const open = tickets.filter((t) => !dismissedIds.has(t.id));
    const followUp = sortOldestFirst(
      open.filter(
        (t) => t.status === "not_received" && getAgeMinutes(t.created_at, nowTs) >= PICKUP_SLACK_MINUTES,
      ),
    );
    const timeline = sortOldestFirst(
      open.filter(
        (t) => t.status !== "finished" && getAgeMinutes(t.created_at, nowTs) >= TIMELINE_NOTICE_MINUTES,
      ),
    );
    const external = sortOldestFirst(open.filter((t) => t.status === "finished"));
    return { followUpRows: followUp, timelineRows: timeline, externalRows: external };
  }, [tickets, dismissedIds, nowTs]);

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

  const ticketLabel = (t: TicketRow) => t.external_ticket_number || t.ticket_number || t.id.slice(0, 8);

  const renderTable = (rows: TicketRow[], kind: "followup" | "timeline" | "external") => {
    if (rows.length === 0) {
      return <p className="py-6 text-center text-sm text-slate-500">لا توجد عناصر في هذا القسم حاليًا.</p>;
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
              {kind !== "external" ? <th className="px-3 py-2 font-semibold">متابعة من الفريق</th> : null}
              {kind === "timeline" ? <th className="px-3 py-2 font-semibold">زمن المعالجة</th> : null}
              <th className="px-3 py-2 font-semibold">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const mins = getAgeMinutes(t.created_at, nowTs);
              const workers = workingNamesByTicket.get(t.id)?.join("، ") ?? "—";
              const busy = actingId === t.id;
              return (
                <tr key={`${kind}-${t.id}`} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-2 font-medium text-slate-900">{ticketLabel(t)}</td>
                  <td className="px-3 py-2 text-slate-600">{normalizeCategoryName(t.ticket_categories)}</td>
                  <td className="px-3 py-2">
                    <Badge variant="muted">{statusLabelAr(t.status)}</Badge>
                  </td>
                  <td className="px-3 py-2 text-slate-600">{mins} دقيقة</td>
                  {kind !== "external" ? <td className="px-3 py-2 text-xs text-slate-600">{workers}</td> : null}
                  {kind === "timeline" ? (
                    <td className="px-3 py-2 text-xs text-amber-900/90">
                      {remainingProcessingWindowCountdownAr(t.created_at, nowTs)}
                    </td>
                  ) : null}
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap items-center justify-end gap-2">
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

  return (
    <div className="space-y-8 bg-white text-slate-900" dir="rtl" lang="ar" style={{ colorScheme: "light" }}>
      <header className="flex flex-col gap-2 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">إدارة المهام</h1>
          <p className="mt-1 text-sm text-slate-600">
            متابعة منظّمة للبلاغات حسب الأولوية (الأقدم أولاً) — التوقيت المرجعي: مكة المكرمة (GMT+٣).
          </p>
          <p className="mt-1 text-xs text-slate-500" suppressHydrationWarning>
            التوقيت الحالي: {formatSaudiNow(nowTs)}
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => router.push("/dashboard/tickets")}>
          الانتقال إلى جدول البلاغات
        </Button>
      </header>

      <Card className="border-sky-100 bg-sky-50/40 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg text-sky-950">متابعة الاستلام</CardTitle>
          <p className="text-sm font-normal text-sky-900/80">
            بلاغات مرّ عليها أكثر من دقيقتين وما زالت بحالة «لم يستلم» — يُنصح بالمتابعة الفورية.
          </p>
        </CardHeader>
        <CardContent>{renderTable(followUpRows, "followup")}</CardContent>
      </Card>

      <Card className="border-amber-100 bg-amber-50/35 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg text-amber-950">إشعار الجدول الزمني</CardTitle>
          <p className="text-sm font-normal text-amber-900/85">
            بلاغات تجاوزت {TIMELINE_NOTICE_MINUTES} دقيقة دون إنهاء — تنبيه لمتابعة زمن المعالجة ضمن النافذة المعتمدة (ساعة من
            لحظة الإنشاء).
          </p>
        </CardHeader>
        <CardContent>{renderTable(timelineRows, "timeline")}</CardContent>
      </Card>

      <Card className="border-slate-200 bg-slate-50/50 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg text-slate-900">متابعة الإغلاق في النظام الخارجي</CardTitle>
          <p className="text-sm font-normal text-slate-600">
            بلاغات بحالة «تم الانتهاء» هنا — أكمل الإغلاق أو التحديث في النظام الخارجي عند الحاجة.
          </p>
        </CardHeader>
        <CardContent>{renderTable(externalRows, "external")}</CardContent>
      </Card>
    </div>
  );
}
