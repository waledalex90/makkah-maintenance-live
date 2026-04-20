"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import imageCompression from "browser-image-compression";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { TicketDetailDrawer } from "@/components/ticket-detail-drawer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TicketMediaDropzone } from "@/components/ticket-media-dropzone";
import { Skeleton } from "@/components/ui/skeleton";
import { arabicErrorMessage } from "@/lib/arabic-errors";
import { companyIdFromZoneId } from "@/lib/ticket-create-company";
import { type TicketStatus, statusBadgeVariant, statusLabelAr } from "@/lib/ticket-status";

type TicketRow = {
  id: string;
  ticket_number: number | null;
  external_ticket_number: string | null;
  reporter_name: string | null;
  reporter_phone?: string | null;
  title: string | null;
  location: string;
  description: string;
  status: TicketStatus;
  zone_id: string | null;
  category_id: number | null;
  ticket_categories?: { name: string } | { name: string }[] | null;
  assigned_engineer_id: string | null;
  assigned_supervisor_id: string | null;
  assigned_technician_id: string | null;
  created_at: string;
  closed_at?: string | null;
};

type ZoneRow = {
  id: string;
  name: string;
};

type CategoryRow = {
  id: number;
  name: string;
};

type TicketsWorkspaceContentProps = {
  role: string;
};

const MAX_VIDEO_BYTES = 80 * 1024 * 1024;
const TICKETS_TABLE_PAGE_SIZE = 20;

const TICKETS_LIST_SELECT =
  "id, ticket_number, external_ticket_number, reporter_name, reporter_phone, title, location, description, status, zone_id, category_id, ticket_categories(name), assigned_engineer_id, assigned_supervisor_id, assigned_technician_id, created_at, closed_at";

export function TicketsWorkspaceContent({ role }: TicketsWorkspaceContentProps) {
  const queryClient = useQueryClient();
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<TicketRow | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [externalTicketNumber, setExternalTicketNumber] = useState("");
  const [reporterNameInput, setReporterNameInput] = useState("");
  const [reporterPhone, setReporterPhone] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [ticketTablePage, setTicketTablePage] = useState(1);
  const [listRefreshing, setListRefreshing] = useState(false);

  const { data: metaData } = useQuery({
    queryKey: ["tickets-workspace-meta"],
    queryFn: async () => {
      const [zonesRes, categoriesRes] = await Promise.all([
        supabase.from("zones").select("id, name").order("name"),
        supabase.from("ticket_categories").select("id, name").eq("is_active", true).order("id"),
      ]);
      if (zonesRes.error) throw new Error(arabicErrorMessage(zonesRes.error.message));
      if (categoriesRes.error) throw new Error(arabicErrorMessage(categoriesRes.error.message));
      return {
        zones: (zonesRes.data as ZoneRow[]) ?? [],
        categories: (categoriesRes.data as CategoryRow[]) ?? [],
      };
    },
    staleTime: 5 * 60_000,
  });

  const { data: ticketsPageData, isLoading: ticketsLoading } = useQuery({
    queryKey: ["tickets-workspace", ticketTablePage],
    queryFn: async () => {
      const from = (ticketTablePage - 1) * TICKETS_TABLE_PAGE_SIZE;
      const to = from + TICKETS_TABLE_PAGE_SIZE - 1;
      const { data, error, count } = await supabase
        .from("tickets")
        .select(TICKETS_LIST_SELECT, { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, to);
      if (error) throw new Error(arabicErrorMessage(error.message));
      return { rows: (data as TicketRow[]) ?? [], total: count ?? 0 };
    },
    placeholderData: (prev) => prev,
    staleTime: 60_000,
  });

  const zones = metaData?.zones ?? [];
  const categories = metaData?.categories ?? [];
  const tickets = ticketsPageData?.rows ?? [];
  const ticketsTotal = ticketsPageData?.total ?? 0;
  const ticketTotalPages = Math.max(1, Math.ceil(ticketsTotal / TICKETS_TABLE_PAGE_SIZE));

  useEffect(() => {
    if (ticketTablePage > ticketTotalPages) {
      setTicketTablePage(ticketTotalPages);
    }
  }, [ticketTablePage, ticketTotalPages]);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data: { user } }) => {
      setMyUserId(user?.id ?? null);
    });
  }, []);

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setExternalTicketNumber("");
    setReporterNameInput("");
    setReporterPhone("");
    setCategoryId("");
    setZoneId("");
    setAttachments([]);
  };

  const uploadOne = async (
    file: File,
    ticketId: string,
    userId: string,
    sortOrder: number,
    companyId: string,
  ) => {
    const isVideo = file.type.startsWith("video/");
    if (isVideo && file.size > MAX_VIDEO_BYTES) {
      toast.error(`الفيديو كبير جداً: ${file.name}`);
      return;
    }
    let uploadBody: Blob = file;
    let baseName = file.name;
    if (!isVideo) {
      uploadBody = await imageCompression(file, {
        maxSizeMB: 1,
        maxWidthOrHeight: 1600,
        useWebWorker: true,
        initialQuality: 0.8,
      });
      baseName = (uploadBody as File).name || file.name;
    }
    const ext = baseName.split(".").pop() ?? (isVideo ? "mp4" : "jpg");
    const filePath = `${ticketId}-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error: uploadError } = await supabase.storage.from("tickets").upload(filePath, uploadBody, { upsert: false });
    if (uploadError) {
      toast.error(`فشل رفع مرفق: ${file.name}`);
      return;
    }
    const { data: publicData } = supabase.storage.from("tickets").getPublicUrl(filePath);
    await supabase.from("ticket_attachments").insert({
      ticket_id: ticketId,
      company_id: companyId,
      uploaded_by: userId,
      file_url: publicData.publicUrl,
      file_type: isVideo ? "video" : "image",
      file_name: file.name,
      sort_order: sortOrder,
    });
  };

  const createTicket = async () => {
    if (!myUserId) {
      toast.error("تعذر تحديد المستخدم الحالي.");
      return;
    }
    if (!externalTicketNumber.trim() || !reporterNameInput.trim() || !title.trim() || !description.trim() || !zoneId || !categoryId) {
      toast.error("يرجى تعبئة الحقول الأساسية.");
      return;
    }

    setCreating(true);
    const { companyId, error: zoneCompanyErr } = await companyIdFromZoneId(supabase, zoneId);
    if (zoneCompanyErr || !companyId) {
      toast.error(
        arabicErrorMessage(zoneCompanyErr ?? "تعذر ربط البلاغ بالشركة. تأكد من اختيار منطقة صالحة."),
      );
      setCreating(false);
      return;
    }

    const locationValue = title.trim();

    const insertPayload = {
      company_id: companyId,
      title: title.trim(),
      description: description.trim(),
      external_ticket_number: externalTicketNumber.trim(),
      reporter_name: reporterNameInput.trim(),
      reporter_phone: reporterPhone.trim() || null,
      category_id: Number(categoryId),
      zone_id: zoneId,
      location: locationValue,
      gps_enabled: false,
      latitude: null as number | null,
      longitude: null as number | null,
      created_by: myUserId,
      shaqes_notes: null as string | null,
      status: "not_received" as TicketStatus,
    };

    const { data: ticketData, error: ticketError } = await supabase
      .from("tickets")
      .insert(insertPayload)
      .select("id")
      .single();

    if (ticketError || !ticketData) {
      toast.error(ticketError?.message ?? "تعذر إنشاء البلاغ.");
      setCreating(false);
      return;
    }

    if (attachments.length > 0) {
      let sortOrder = 0;
      for (const file of attachments) {
        await uploadOne(file, ticketData.id, myUserId, sortOrder, companyId);
        sortOrder += 1;
      }
    }

    setCreating(false);
    toast.success("تم إنشاء البلاغ بنجاح.");
    resetForm();
    await queryClient.invalidateQueries({ queryKey: ["tickets-workspace"] });
  };

  const closeTicketAsReporter = async (ticketId: string) => {
    const { error } = await supabase.from("tickets").update({ status: "finished" }).eq("id", ticketId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("تم إغلاق البلاغ.");
    await queryClient.invalidateQueries({ queryKey: ["tickets-workspace"] });
  };

  const refreshTicketsData = async () => {
    if (listRefreshing) return;
    setListRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ["tickets-workspace"] });
      await queryClient.invalidateQueries({ queryKey: ["tickets-workspace-meta"] });
      toast.success("تم التحديث.");
    } finally {
      setListRefreshing(false);
    }
  };

  return (
    <div className="min-h-screen bg-white text-slate-900" dir="rtl" lang="ar" style={{ colorScheme: "light" }}>
      <header className="mb-6 flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">إنشاء بلاغ جديد</h1>
          <p className="mt-1 text-sm text-slate-600">نموذج بلاغ مع التوجيه والمتابعة — وضع عرض فاتح للوضوح.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-11 w-11 shrink-0 p-0"
            disabled={listRefreshing}
            onClick={() => void refreshTicketsData()}
            aria-label="تحديث الجدول"
          >
            <RefreshCw className={`size-4 ${listRefreshing ? "animate-spin" : ""}`} />
          </Button>
          <Button
            type="button"
            className="h-11 min-w-[160px] shrink-0 bg-slate-900 text-base text-white hover:bg-slate-800"
            onClick={() => void createTicket()}
            disabled={creating}
          >
            {creating ? "جاري الإنشاء..." : "إرسال البلاغ"}
          </Button>
        </div>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mt-0 grid gap-3 md:grid-cols-2">
          <div>
            <p className="mb-1 text-xs text-slate-600">رقم البلاغ</p>
            <Input
              value={externalTicketNumber}
              onChange={(e) => setExternalTicketNumber(e.target.value)}
              placeholder="اكتب رقم البلاغ القادم من النظام الخارجي"
              className="border-slate-200 bg-white"
            />
          </div>
          <div>
            <p className="mb-1 text-xs text-slate-600">مقدم البلاغ</p>
            <Input
              value={reporterNameInput}
              onChange={(e) => setReporterNameInput(e.target.value)}
              placeholder="اكتب اسم مقدم البلاغ من الموقع الخارجي"
              className="border-slate-200 bg-white"
            />
          </div>
        </div>

        <div className="mt-3">
          <p className="mb-1 text-xs text-slate-600">رقم تليفون مقدم البلاغ</p>
          <Input
            value={reporterPhone}
            onChange={(e) => setReporterPhone(e.target.value)}
            placeholder="مثال: 05xxxxxxxx"
            className="border-slate-200 bg-white"
            type="tel"
            dir="ltr"
          />
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div>
            <p className="mb-1 text-xs text-slate-600">تصنيف البلاغ</p>
            <select
              className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">اختر التصنيف</option>
              {categories.map((category) => (
                <option key={category.id} value={String(category.id)}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <p className="mb-1 text-xs text-slate-600">المنطقة</p>
            <select
              className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900"
              value={zoneId}
              onChange={(e) => setZoneId(e.target.value)}
            >
              <option value="">اختر المنطقة</option>
              {zones.map((zone) => (
                <option key={zone.id} value={zone.id}>
                  {zone.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-3 space-y-3">
          <div>
            <p className="mb-1 text-xs text-slate-600">موقع البلاغ</p>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="صف موقع البلاغ بدقة"
              className="border-slate-200 bg-white"
            />
          </div>
          <div>
            <p className="mb-1 text-xs text-slate-600">تفاصيل البلاغ</p>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="اكتب تفاصيل البلاغ..."
              className="border-slate-200 bg-white"
            />
          </div>

          <TicketMediaDropzone files={attachments} onFilesChange={setAttachments} disabled={creating} />
        </div>
      </section>

      <section className="mt-8 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold text-slate-900">البلاغات</h2>
        {ticketsLoading && !ticketsPageData ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-right text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-800">
                <tr>
                  <th className="px-3 py-2">رقم البلاغ</th>
                  <th className="px-3 py-2">موقع البلاغ</th>
                  <th className="px-3 py-2">هاتف المبلّغ</th>
                  <th className="px-3 py-2">الحالة</th>
                  {role === "reporter" ? <th className="px-3 py-2">إجراء</th> : null}
                </tr>
              </thead>
              <tbody>
                {tickets.map((ticket) => (
                  <tr
                    key={ticket.id}
                    className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
                    onClick={() => {
                      setSelectedTicket(ticket);
                      setDrawerOpen(true);
                    }}
                  >
                    <td className="px-3 py-2">{ticket.external_ticket_number ?? `#${ticket.ticket_number ?? "-"}`}</td>
                    <td className="px-3 py-2">{ticket.title ?? "-"}</td>
                    <td className="px-3 py-2" dir="ltr">
                      {ticket.reporter_phone || "—"}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={statusBadgeVariant(ticket.status)}>{statusLabelAr(ticket.status)}</Badge>
                    </td>
                    {role === "reporter" ? (
                      <td className="px-3 py-2">
                        {ticket.status !== "finished" ? (
                          <Button
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              void closeTicketAsReporter(ticket.id);
                            }}
                          >
                            إغلاق البلاغ
                          </Button>
                        ) : (
                          "-"
                        )}
                      </td>
                    ) : null}
                  </tr>
                ))}
                {tickets.length === 0 ? (
                  <tr>
                    <td colSpan={role === "reporter" ? 5 : 4} className="px-3 py-6 text-center text-slate-500">
                      لا توجد بلاغات حالياً.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
        {!ticketsLoading && ticketsTotal > TICKETS_TABLE_PAGE_SIZE ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3 text-sm">
            <p className="text-slate-600">
              عرض {(ticketTablePage - 1) * TICKETS_TABLE_PAGE_SIZE + 1}–
              {Math.min(ticketTablePage * TICKETS_TABLE_PAGE_SIZE, ticketsTotal)} من {ticketsTotal}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-md border border-slate-200 px-3 py-1 text-xs font-medium disabled:opacity-40"
                disabled={ticketTablePage <= 1}
                onClick={() => setTicketTablePage((p) => Math.max(1, p - 1))}
              >
                السابق
              </button>
              <span className="text-xs text-slate-500">
                {ticketTablePage} / {ticketTotalPages}
              </span>
              <button
                type="button"
                className="rounded-md border border-slate-200 px-3 py-1 text-xs font-medium disabled:opacity-40"
                disabled={ticketTablePage >= ticketTotalPages}
                onClick={() => setTicketTablePage((p) => Math.min(ticketTotalPages, p + 1))}
              >
                التالي
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <TicketDetailDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        ticket={selectedTicket}
        zoneName={
          selectedTicket?.zone_id ? zones.find((z) => z.id === selectedTicket.zone_id)?.name ?? "-" : "-"
        }
        onTicketUpdated={async () => {
          await queryClient.invalidateQueries({ queryKey: ["tickets-workspace"] });
        }}
        onMarkTicketRead={() => {}}
      />
    </div>
  );
}
