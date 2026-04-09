"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { TicketDetailDrawer } from "@/components/ticket-detail-drawer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type TicketStatus = "new" | "assigned" | "on_the_way" | "arrived" | "fixed";

type TicketRow = {
  id: string;
  ticket_number: number | null;
  title: string | null;
  location: string;
  description: string;
  status: TicketStatus;
  zone_id: string | null;
  assigned_engineer_id: string | null;
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

type ProfileRow = {
  id: string;
  full_name: string;
  role: string;
};

type TicketsWorkspaceContentProps = {
  role: string;
};

function statusBadgeVariant(status: TicketStatus): "red" | "yellow" | "green" | "muted" {
  if (status === "new") return "red";
  if (status === "on_the_way") return "yellow";
  if (status === "fixed") return "green";
  return "muted";
}

function statusLabel(status: TicketStatus): string {
  if (status === "new") return "جديد";
  if (status === "assigned") return "مُسند";
  if (status === "on_the_way") return "في الطريق";
  if (status === "arrived") return "تم الوصول";
  return "مغلق";
}

export function TicketsWorkspaceContent({ role }: TicketsWorkspaceContentProps) {
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [myName, setMyName] = useState("");
  const [zones, setZones] = useState<ZoneRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<TicketRow | null>(null);
  const [showShaqes, setShowShaqes] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [gpsEnabled, setGpsEnabled] = useState(false);
  const [locationText, setLocationText] = useState("");
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [assignedSupervisorId, setAssignedSupervisorId] = useState("");
  const [assignedTechnicianId, setAssignedTechnicianId] = useState("");
  const [assignedEngineerId, setAssignedEngineerId] = useState("");

  const zoneNameMap = useMemo(() => {
    const map = new Map<string, string>();
    zones.forEach((zone) => map.set(zone.id, zone.name));
    return map;
  }, [zones]);

  const canRouteTicket = role !== "reporter";
  const supervisors = profiles.filter((p) => p.role === "supervisor");
  const technicians = profiles.filter((p) => p.role === "technician");
  const engineers = profiles.filter((p) => p.role === "engineer");

  const loadData = async () => {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    setMyUserId(user?.id ?? null);

    if (user?.id) {
      const { data: me } = await supabase.from("profiles").select("full_name").eq("id", user.id).single();
      setMyName(me?.full_name ?? "");
    }

    const [zonesRes, categoriesRes, profilesRes, ticketsRes] = await Promise.all([
      supabase.from("zones").select("id, name").order("name"),
      supabase.from("ticket_categories").select("id, name").eq("is_active", true).order("id"),
      supabase
        .from("profiles")
        .select("id, full_name, role")
        .in("role", ["engineer", "supervisor", "technician"])
        .order("full_name"),
      supabase
        .from("tickets")
        .select("id, ticket_number, title, location, description, status, zone_id, assigned_engineer_id, created_at")
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

    if (zonesRes.error) toast.error(zonesRes.error.message);
    if (categoriesRes.error) toast.error(categoriesRes.error.message);
    if (profilesRes.error) toast.error(profilesRes.error.message);
    if (ticketsRes.error) toast.error(ticketsRes.error.message);

    setZones((zonesRes.data as ZoneRow[]) ?? []);
    setCategories((categoriesRes.data as CategoryRow[]) ?? []);
    setProfiles((profilesRes.data as ProfileRow[]) ?? []);
    setTickets((ticketsRes.data as TicketRow[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData();
  }, []);

  const captureGps = () => {
    if (!navigator.geolocation) {
      toast.error("المتصفح لا يدعم تحديد الموقع.");
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

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setCategoryId("");
    setZoneId("");
    setGpsEnabled(false);
    setLocationText("");
    setLatitude(null);
    setLongitude(null);
    setAttachments([]);
    setAssignedSupervisorId("");
    setAssignedTechnicianId("");
    setAssignedEngineerId("");
    setShowShaqes(false);
  };

  const createTicket = async () => {
    if (!myUserId) {
      toast.error("تعذر تحديد المستخدم الحالي.");
      return;
    }
    if (!title.trim() || !description.trim() || !zoneId || !categoryId) {
      toast.error("يرجى تعبئة الحقول الأساسية.");
      return;
    }

    setCreating(true);
    const locationValue = locationText.trim() || zoneNameMap.get(zoneId) || "بدون تحديد";

    const insertPayload = {
      title: title.trim(),
      description: description.trim(),
      category_id: Number(categoryId),
      zone_id: zoneId,
      location: locationValue,
      gps_enabled: gpsEnabled,
      latitude: gpsEnabled ? latitude : null,
      longitude: gpsEnabled ? longitude : null,
      created_by: myUserId,
      assigned_supervisor_id: canRouteTicket && showShaqes ? assignedSupervisorId || null : null,
      assigned_technician_id: canRouteTicket && showShaqes ? assignedTechnicianId || null : null,
      assigned_engineer_id: canRouteTicket && showShaqes ? assignedEngineerId || null : null,
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
        const filePath = `tickets/${ticketData.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("ticket-attachments")
          .upload(filePath, file, { upsert: false });
        if (uploadError) {
          toast.error(`فشل رفع مرفق: ${file.name}`);
          continue;
        }
        const { data: publicData } = supabase.storage.from("ticket-attachments").getPublicUrl(filePath);
        await supabase.from("ticket_attachments").insert({
          ticket_id: ticketData.id,
          uploaded_by: myUserId,
          file_url: publicData.publicUrl,
          file_type: "image",
        });
      }
    }

    setCreating(false);
    toast.success("تم إنشاء البلاغ بنجاح.");
    resetForm();
    await loadData();
  };

  const closeTicketAsReporter = async (ticketId: string) => {
    const { error } = await supabase.from("tickets").update({ status: "fixed" }).eq("id", ticketId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("تم إغلاق البلاغ.");
    await loadData();
  };

  return (
    <div className="space-y-6" dir="rtl" lang="ar">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-xl font-semibold">إنشاء بلاغ جديد</h1>
        <p className="mt-1 text-sm text-slate-500">نموذج بلاغ احترافي مع التوجيه والمتابعة.</p>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div>
            <p className="mb-1 text-xs text-slate-500">رقم البلاغ</p>
            <Input value="سيتم إنشاؤه تلقائيًا" readOnly />
          </div>
          <div>
            <p className="mb-1 text-xs text-slate-500">مقدم البلاغ</p>
            <Input value={myName || "..."} readOnly />
          </div>
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

        <div className="mt-3 space-y-3">
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
            {attachments.length > 0 ? <p className="mt-1 text-xs text-slate-500">عدد الصور: {attachments.length}</p> : null}
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
                <Button type="button" variant="outline" onClick={captureGps}>سحب الموقع الحالي</Button>
                <Input value={locationText} onChange={(e) => setLocationText(e.target.value)} placeholder="سيظهر الموقع هنا" />
              </div>
            ) : (
              <Input value={locationText} onChange={(e) => setLocationText(e.target.value)} placeholder="اكتب وصف المكان (اختياري)" />
            )}
          </div>

          <div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowShaqes((prev) => !prev)}
              disabled={!canRouteTicket}
            >
              شاخص
            </Button>
            {!canRouteTicket ? <p className="mt-1 text-xs text-slate-500">مدخل البيانات لا يملك صلاحية التوجيه.</p> : null}
          </div>

          {showShaqes && canRouteTicket ? (
            <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-3">
              <p className="mb-2 text-sm font-semibold text-indigo-900">توجيه البلاغ للمسؤول</p>
              <div className="grid gap-2 md:grid-cols-3">
                <select
                  className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
                  value={assignedEngineerId}
                  onChange={(e) => setAssignedEngineerId(e.target.value)}
                >
                  <option value="">مهندس (اختياري)</option>
                  {engineers.map((row) => (
                    <option key={row.id} value={row.id}>{row.full_name}</option>
                  ))}
                </select>
                <select
                  className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
                  value={assignedSupervisorId}
                  onChange={(e) => setAssignedSupervisorId(e.target.value)}
                >
                  <option value="">مشرف (اختياري)</option>
                  {supervisors.map((row) => (
                    <option key={row.id} value={row.id}>{row.full_name}</option>
                  ))}
                </select>
                <select
                  className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
                  value={assignedTechnicianId}
                  onChange={(e) => setAssignedTechnicianId(e.target.value)}
                >
                  <option value="">فني (اختياري)</option>
                  {technicians.map((row) => (
                    <option key={row.id} value={row.id}>{row.full_name}</option>
                  ))}
                </select>
              </div>
            </div>
          ) : null}
        </div>

        <div className="mt-4">
          <Button onClick={() => void createTicket()} disabled={creating}>
            {creating ? "جاري الإنشاء..." : "إرسال البلاغ"}
          </Button>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold">البلاغات</h2>
        {loading ? (
          <p className="text-sm text-slate-500">جاري تحميل البيانات...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-right text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-700">
                <tr>
                  <th className="px-3 py-2">رقم البلاغ</th>
                  <th className="px-3 py-2">العنوان</th>
                  <th className="px-3 py-2">الموقع</th>
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
                    <td className="px-3 py-2">#{ticket.ticket_number ?? "-"}</td>
                    <td className="px-3 py-2">{ticket.title ?? "-"}</td>
                    <td className="px-3 py-2">{ticket.location}</td>
                    <td className="px-3 py-2">
                      <Badge variant={statusBadgeVariant(ticket.status)}>{statusLabel(ticket.status)}</Badge>
                    </td>
                    {role === "reporter" ? (
                      <td className="px-3 py-2">
                        {ticket.status !== "fixed" ? (
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
        zoneName={selectedTicket?.zone_id ? zoneNameMap.get(selectedTicket.zone_id) ?? "-" : "-"}
        onTicketUpdated={loadData}
        onMarkTicketRead={() => {}}
      />
    </div>
  );
}
