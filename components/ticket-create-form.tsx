"use client";

import { useEffect, useState } from "react";
import imageCompression from "browser-image-compression";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TicketMediaDropzone } from "@/components/ticket-media-dropzone";
import { arabicErrorMessage } from "@/lib/arabic-errors";
import { companyIdFromZoneId } from "@/lib/ticket-create-company";
import type { TicketStatus } from "@/lib/ticket-status";

type ZoneRow = {
  id: string;
  name: string;
};

type CategoryRow = {
  id: number;
  name: string;
};

const MAX_VIDEO_BYTES = 80 * 1024 * 1024;

type TicketCreateFormProps = {
  role: string;
  onCreated: () => Promise<void> | void;
  onCancel: () => void;
};

export function TicketCreateForm({ role: _role, onCreated, onCancel }: TicketCreateFormProps) {
  const [zones, setZones] = useState<ZoneRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [externalTicketNumber, setExternalTicketNumber] = useState("");
  const [reporterNameInput, setReporterNameInput] = useState("");
  const [reporterPhone, setReporterPhone] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      const [zonesRes, categoriesRes] = await Promise.all([
        supabase.from("zones").select("id, name").order("name"),
        supabase.from("ticket_categories").select("id, name").eq("is_active", true).order("id"),
      ]);
      if (zonesRes.error) toast.error(arabicErrorMessage(zonesRes.error.message));
      if (categoriesRes.error) toast.error(arabicErrorMessage(categoriesRes.error.message));
      setZones((zonesRes.data as ZoneRow[]) ?? []);
      setCategories((categoriesRes.data as CategoryRow[]) ?? []);
      setLoading(false);
    };
    void loadData();
  }, []);

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
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.id) {
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
      created_by: user.id,
      shaqes_notes: null as string | null,
      status: "not_received" as TicketStatus,
    };

    const { data: ticketData, error: ticketError } = await supabase
      .from("tickets")
      .insert(insertPayload)
      .select("id")
      .single();

    if (ticketError || !ticketData) {
      toast.error(arabicErrorMessage(ticketError?.message ?? "تعذر إنشاء البلاغ."));
      setCreating(false);
      return;
    }

    if (attachments.length > 0) {
      let sortOrder = 0;
      for (const file of attachments) {
        await uploadOne(file, ticketData.id, user.id, sortOrder, companyId);
        sortOrder += 1;
      }
    }

    setCreating(false);
    toast.success("تم إنشاء البلاغ بنجاح.");
    await onCreated();
    onCancel();
  };

  if (loading) {
    return (
      <div className="text-slate-800" style={{ colorScheme: "light" }}>
        <p className="text-sm text-slate-600">جاري تحميل نموذج البلاغ...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 bg-white text-slate-900" dir="rtl" lang="ar" style={{ colorScheme: "light" }}>
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <p className="mb-1 text-xs text-slate-600">رقم البلاغ</p>
          <Input
            value={externalTicketNumber}
            onChange={(e) => setExternalTicketNumber(e.target.value)}
            placeholder="اكتب رقم البلاغ القادم من النظام الخارجي"
            className="border-slate-200 bg-white text-slate-900"
          />
        </div>
        <div>
          <p className="mb-1 text-xs text-slate-600">مقدم البلاغ</p>
          <Input
            value={reporterNameInput}
            onChange={(e) => setReporterNameInput(e.target.value)}
            placeholder="اكتب اسم مقدم البلاغ من الموقع الخارجي"
            className="border-slate-200 bg-white text-slate-900"
          />
        </div>
      </div>

      <div>
        <p className="mb-1 text-xs text-slate-600">رقم تليفون مقدم البلاغ</p>
        <Input
          value={reporterPhone}
          onChange={(e) => setReporterPhone(e.target.value)}
          placeholder="مثال: 05xxxxxxxx"
          className="border-slate-200 bg-white text-slate-900"
          type="tel"
          dir="ltr"
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
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

      <div>
        <p className="mb-1 text-xs text-slate-600">موقع البلاغ</p>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="صف موقع البلاغ بدقة (مثال: عند مدخل المبنى أ)"
          className="border-slate-200 bg-white text-slate-900"
        />
      </div>

      <div>
        <p className="mb-1 text-xs text-slate-600">تفاصيل البلاغ</p>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="اكتب تفاصيل البلاغ..."
          className="border-slate-200 bg-white text-slate-900"
        />
      </div>

      <TicketMediaDropzone files={attachments} onFilesChange={setAttachments} disabled={creating} />

      <div className="sticky bottom-0 z-10 -mx-1 flex items-center justify-end gap-2 border-t border-slate-200 bg-white/95 px-1 pb-1 pt-3 backdrop-blur-sm">
        <Button variant="outline" onClick={onCancel} disabled={creating} className="min-h-11 border-slate-300 bg-white px-4 text-slate-800">
          إلغاء
        </Button>
        <Button onClick={() => void createTicket()} disabled={creating} className="min-h-11 bg-emerald-600 px-5 text-white hover:bg-emerald-700">
          {creating ? "جاري الإرسال..." : "إرسال البلاغ"}
        </Button>
      </div>
    </div>
  );
}
