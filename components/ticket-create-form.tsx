"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ensureGpsPermission } from "@/lib/gps-permission";

type ZoneRow = {
  id: string;
  name: string;
};

type CategoryRow = {
  id: number;
  name: string;
};

type TicketCreateFormProps = {
  role: string;
  onCreated: () => Promise<void> | void;
  onCancel: () => void;
};

export function TicketCreateForm({ role, onCreated, onCancel }: TicketCreateFormProps) {
  const [zones, setZones] = useState<ZoneRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [externalTicketNumber, setExternalTicketNumber] = useState("");
  const [reporterNameInput, setReporterNameInput] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [gpsEnabled, setGpsEnabled] = useState(false);
  const [locationText, setLocationText] = useState("");
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [showShaqes, setShowShaqes] = useState(false);
  const [shaqesNotes, setShaqesNotes] = useState("");

  const canRouteTicket = role !== "reporter";
  const zoneNameMap = useMemo(() => {
    const map = new Map<string, string>();
    zones.forEach((zone) => map.set(zone.id, zone.name));
    return map;
  }, [zones]);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      const [zonesRes, categoriesRes] = await Promise.all([
        supabase.from("zones").select("id, name").order("name"),
        supabase.from("ticket_categories").select("id, name").eq("is_active", true).order("id"),
      ]);
      if (zonesRes.error) toast.error(zonesRes.error.message);
      if (categoriesRes.error) toast.error(categoriesRes.error.message);
      setZones((zonesRes.data as ZoneRow[]) ?? []);
      setCategories((categoriesRes.data as CategoryRow[]) ?? []);
      setLoading(false);
    };
    void loadData();
  }, []);

  const captureGps = async () => {
    const permission = await ensureGpsPermission();
    if (permission === "unsupported") {
      toast.error("المتصفح لا يدعم تحديد الموقع.");
      return;
    }
    if (permission === "insecure") {
      toast.error("ميزة GPS تعمل فقط عبر HTTPS في بيئة الإنتاج.");
      return;
    }
    if (permission === "denied") {
      toast.error("تم رفض صلاحية الموقع. فعّلها من إعدادات المتصفح.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = Number(position.coords.latitude.toFixed(6));
        const lng = Number(position.coords.longitude.toFixed(6));
        setLatitude(lat);
        setLongitude(lng);
        setLocationText(`GPS: ${lat}, ${lng}`);
      },
      () => {
        toast.error("تعذر الحصول على الموقع الجغرافي.");
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
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
    const locationValue = locationText.trim() || zoneNameMap.get(zoneId) || "بدون تحديد";
    const insertPayload = {
      title: title.trim(),
      description: description.trim(),
      external_ticket_number: externalTicketNumber.trim(),
      reporter_name: reporterNameInput.trim(),
      category_id: Number(categoryId),
      zone_id: zoneId,
      location: locationValue,
      gps_enabled: gpsEnabled,
      latitude: gpsEnabled ? latitude : null,
      longitude: gpsEnabled ? longitude : null,
      created_by: user.id,
      shaqes_notes: showShaqes && canRouteTicket ? shaqesNotes.trim() || null : null,
      status: "new" as const,
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
      for (const file of attachments) {
        const ext = file.name.split(".").pop() ?? "jpg";
        const filePath = `${ticketData.id}-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("tickets")
          .upload(filePath, file, { upsert: false });
        if (uploadError) {
          toast.error(`فشل رفع مرفق: ${file.name}`);
          continue;
        }
        const { data: publicData } = supabase.storage.from("tickets").getPublicUrl(filePath);
        await supabase.from("ticket_attachments").insert({
          ticket_id: ticketData.id,
          uploaded_by: user.id,
          file_url: publicData.publicUrl,
          file_type: "image",
        });
      }
    }

    setCreating(false);
    toast.success("تم إنشاء البلاغ بنجاح.");
    await onCreated();
    onCancel();
  };

  if (loading) {
    return <p className="text-sm text-slate-500">جاري تحميل نموذج البلاغ...</p>;
  }

  return (
    <div className="space-y-4" dir="rtl" lang="ar">
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <p className="mb-1 text-xs text-slate-500">رقم البلاغ</p>
          <Input
            value={externalTicketNumber}
            onChange={(e) => setExternalTicketNumber(e.target.value)}
            placeholder="اكتب رقم البلاغ القادم من النظام الخارجي"
          />
        </div>
        <div>
          <p className="mb-1 text-xs text-slate-500">مقدم البلاغ</p>
          <Input
            value={reporterNameInput}
            onChange={(e) => setReporterNameInput(e.target.value)}
            placeholder="اكتب اسم مقدم البلاغ من الموقع الخارجي"
          />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <p className="mb-1 text-xs text-slate-500">تصنيف البلاغ</p>
          <select
            className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
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
          <p className="mb-1 text-xs text-slate-500">المنطقة</p>
          <select
            className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
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
        <p className="mb-1 text-xs text-slate-500">عنوان البلاغ</p>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثال: عطل في لوحة الكهرباء" />
      </div>

      <div>
        <p className="mb-1 text-xs text-slate-500">تفاصيل البلاغ</p>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="اكتب تفاصيل البلاغ..." />
      </div>

      <div>
        <p className="mb-1 text-xs text-slate-500">المرفقات (صور)</p>
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => setAttachments(Array.from(e.target.files ?? []))}
          className="block w-full text-xs"
        />
      </div>

      <div className="rounded-lg border border-slate-200 p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-medium">الموقع الجغرافي (GPS)</p>
          <button
            type="button"
            className={`rounded-md px-3 py-1 text-xs ${gpsEnabled ? "bg-emerald-600 text-white" : "border border-slate-300 bg-white text-slate-700"}`}
            onClick={() => setGpsEnabled((prev) => !prev)}
          >
            {gpsEnabled ? "مفعّل" : "معطّل"}
          </button>
        </div>
        {gpsEnabled ? (
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={() => void captureGps()}>سحب الموقع الحالي</Button>
            <Input value={locationText} onChange={(e) => setLocationText(e.target.value)} placeholder="سيظهر الموقع هنا" />
          </div>
        ) : (
          <Input value={locationText} onChange={(e) => setLocationText(e.target.value)} placeholder="اكتب وصف المكان (اختياري)" />
        )}
      </div>

      <div>
        <Button type="button" variant="outline" onClick={() => setShowShaqes((prev) => !prev)} disabled={!canRouteTicket}>
          شاخص
        </Button>
      </div>

      {showShaqes && canRouteTicket ? (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-3">
          <p className="mb-2 text-sm font-semibold text-indigo-900">شاخص - أرقام وملاحظات فنية</p>
          <Textarea
            value={shaqesNotes}
            onChange={(e) => setShaqesNotes(e.target.value)}
            placeholder="اكتب أرقام المرجع والملاحظات الفنية الخاصة بالتوجيه..."
          />
        </div>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" onClick={onCancel} disabled={creating}>إلغاء</Button>
        <Button onClick={() => void createTicket()} disabled={creating}>
          {creating ? "جاري الإنشاء..." : "حفظ البلاغ"}
        </Button>
      </div>
    </div>
  );
}
