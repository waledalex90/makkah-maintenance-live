"use client";

import { useEffect, useState } from "react";
import imageCompression from "browser-image-compression";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { TicketDetailDrawer } from "@/components/ticket-detail-drawer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TicketMediaDropzone } from "@/components/ticket-media-dropzone";
import { arabicErrorMessage } from "@/lib/arabic-errors";
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

export function TicketsWorkspaceContent({ role }: TicketsWorkspaceContentProps) {
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [zones, setZones] = useState<ZoneRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [loading, setLoading] = useState(true);
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

  const loadData = async () => {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    setMyUserId(user?.id ?? null);

    const [zonesRes, categoriesRes, ticketsRes] = await Promise.all([
      supabase.from("zones").select("id, name").order("name"),
      supabase.from("ticket_categories").select("id, name").eq("is_active", true).order("id"),
      supabase
        .from("tickets")
        .select(
          "id, ticket_number, external_ticket_number, reporter_name, reporter_phone, title, location, description, status, zone_id, category_id, ticket_categories(name), assigned_engineer_id, assigned_supervisor_id, assigned_technician_id, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

    if (zonesRes.error) toast.error(arabicErrorMessage(zonesRes.error.message));
    if (categoriesRes.error) toast.error(arabicErrorMessage(categoriesRes.error.message));
    if (ticketsRes.error) toast.error(arabicErrorMessage(ticketsRes.error.message));

    setZones((zonesRes.data as ZoneRow[]) ?? []);
    setCategories((categoriesRes.data as CategoryRow[]) ?? []);
    setTickets((ticketsRes.data as TicketRow[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    void loadData();
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

  const uploadOne = async (file: File, ticketId: string, userId: string, sortOrder: number) => {
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
    const locationValue = title.trim();

    const insertPayload = {
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
        await uploadOne(file, ticketData.id, myUserId, sortOrder);
        sortOrder += 1;
      }
    }

    setCreating(false);
    toast.success("تم إنشاء البلاغ بنجاح.");
    resetForm();
    await loadData();
  };

  const closeTicketAsReporter = async (ticketId: string) => {
    const { error } = await supabase.from("tickets").update({ status: "finished" }).eq("id", ticketId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("تم إغلاق البلاغ.");
    await loadData();
  };

  return (
    <div className="min-h-screen bg-white text-slate-900" dir="rtl" lang="ar" style={{ colorScheme: "light" }}>
      <header className="mb-6 flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">إنشاء بلاغ جديد</h1>
          <p className="mt-1 text-sm text-slate-600">نموذج بلاغ مع التوجيه والمتابعة — وضع عرض فاتح للوضوح.</p>
        </div>
        <Button
          type="button"
          className="h-11 min-w-[160px] shrink-0 bg-slate-900 text-base text-white hover:bg-slate-800"
          onClick={() => void createTicket()}
          disabled={creating}
        >
          {creating ? "جاري الإنشاء..." : "إرسال البلاغ"}
        </Button>
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
        {loading ? (
          <p className="text-sm text-slate-600">جاري تحميل البيانات...</p>
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
      </section>

      <TicketDetailDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        ticket={selectedTicket}
        zoneName={
          selectedTicket?.zone_id ? zones.find((z) => z.id === selectedTicket.zone_id)?.name ?? "-" : "-"
        }
        onTicketUpdated={loadData}
        onMarkTicketRead={() => {}}
      />
    </div>
  );
}
