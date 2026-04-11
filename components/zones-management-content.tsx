"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { getLeafletTileProps } from "@/lib/maptiler";
import { supabase } from "@/lib/supabase";

const ZonePickerMap = dynamic(
  () => import("@/components/zone-picker-map").then((m) => m.ZonePickerMap),
  {
    ssr: false,
    loading: () => <div className="h-56 animate-pulse rounded-md border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800/50" />,
  },
);

type ZoneRow = {
  id: string;
  name: string;
  center_latitude: number | null;
  center_longitude: number | null;
};

type ZoneFormErrors = {
  name?: string;
  map?: string;
};

type ProfileRow = {
  id: string;
  full_name: string;
  role: "admin" | "engineer" | "supervisor" | "technician";
};

const MAKKAH_CENTER: [number, number] = [21.4225, 39.8262];

export function ZonesManagementContent() {
  const mapTiles = useMemo(() => getLeafletTileProps(), []);
  const [zones, setZones] = useState<ZoneRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [editingZone, setEditingZone] = useState<ZoneRow | null>(null);
  const [formName, setFormName] = useState("");
  const [formLatitude, setFormLatitude] = useState<number | null>(null);
  const [formLongitude, setFormLongitude] = useState<number | null>(null);
  const [errors, setErrors] = useState<ZoneFormErrors>({});
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [teamModalOpen, setTeamModalOpen] = useState(false);
  const [teamZone, setTeamZone] = useState<ZoneRow | null>(null);
  const [selectedProfileIds, setSelectedProfileIds] = useState<string[]>([]);
  const [savingTeam, setSavingTeam] = useState(false);

  const miniMapCenter: [number, number] =
    formLatitude !== null && formLongitude !== null ? [formLatitude, formLongitude] : MAKKAH_CENTER;

  const modalTitle = useMemo(() => (editingZone ? "تعديل المنطقة" : "إضافة منطقة جديدة"), [editingZone]);

  const loadZones = async () => {
    const { data, error } = await supabase
      .from("zones")
      .select("id, name, center_latitude, center_longitude")
      .order("name");

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    setZones((data as ZoneRow[]) ?? []);
    setLoading(false);
  };

  const loadProfiles = async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, role")
      .in("role", ["admin", "engineer", "supervisor", "technician"])
      .order("full_name");

    if (error) {
      toast.error(error.message);
      return;
    }

    setProfiles((data as ProfileRow[]) ?? []);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void Promise.all([loadZones(), loadProfiles()]);
  }, []);

  const resetForm = () => {
    setFormName("");
    setFormLatitude(null);
    setFormLongitude(null);
    setEditingZone(null);
    setErrors({});
  };

  const closeModal = () => {
    setIsModalOpen(false);
    resetForm();
  };

  const openCreateModal = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const openEditModal = (zone: ZoneRow) => {
    setEditingZone(zone);
    setFormName(zone.name);
    setFormLatitude(zone.center_latitude);
    setFormLongitude(zone.center_longitude);
    setErrors({});
    setIsModalOpen(true);
  };

  useEffect(() => {
    if (!isModalOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeModal();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isModalOpen]);

  const validate = () => {
    const nextErrors: ZoneFormErrors = {};

    if (!formName.trim()) {
      nextErrors.name = "هذا الحقل مطلوب";
    }
    if (formLatitude === null || formLongitude === null) {
      nextErrors.map = "يرجى اختيار موقع المنطقة على الخريطة";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const saveZone = async () => {
    if (!validate()) return;

    setIsSubmitting(true);

    if (editingZone) {
      const { error } = await supabase
        .from("zones")
        .update({
          name: formName.trim(),
          center_latitude: formLatitude,
          center_longitude: formLongitude,
        })
        .eq("id", editingZone.id);

      setIsSubmitting(false);

      if (error) {
        toast.error(error.message);
        return;
      }

      toast.success("تم تحديث المنطقة بنجاح.");
      closeModal();
      await loadZones();
      return;
    }

    const { error } = await supabase.from("zones").insert({
      name: formName.trim(),
      center_latitude: formLatitude,
      center_longitude: formLongitude,
    });

    setIsSubmitting(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("تمت إضافة المنطقة بنجاح.");
    closeModal();
    await loadZones();
  };

  const deleteZone = async (zone: ZoneRow) => {
    const confirmed = window.confirm(`هل تريد حذف المنطقة "${zone.name}"؟`);
    if (!confirmed) return;

    setIsDeletingId(zone.id);
    const { error } = await supabase.from("zones").delete().eq("id", zone.id);
    setIsDeletingId(null);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("تم حذف المنطقة.");
    await loadZones();
  };

  const openTeamModal = async (zone: ZoneRow) => {
    setTeamZone(zone);
    setTeamModalOpen(true);
    const { data, error } = await supabase
      .from("zone_profiles")
      .select("profile_id")
      .eq("zone_id", zone.id);
    if (error) {
      toast.error(error.message);
      setSelectedProfileIds([]);
      return;
    }
    setSelectedProfileIds((data ?? []).map((row) => row.profile_id as string));
  };

  const closeTeamModal = () => {
    setTeamModalOpen(false);
    setTeamZone(null);
    setSelectedProfileIds([]);
  };

  const toggleProfile = (profileId: string) => {
    setSelectedProfileIds((prev) =>
      prev.includes(profileId) ? prev.filter((id) => id !== profileId) : [...prev, profileId],
    );
  };

  const saveZoneTeam = async () => {
    if (!teamZone) return;
    setSavingTeam(true);

    const { error: deleteError } = await supabase.from("zone_profiles").delete().eq("zone_id", teamZone.id);
    if (deleteError) {
      setSavingTeam(false);
      toast.error(deleteError.message);
      return;
    }

    if (selectedProfileIds.length > 0) {
      const { error: insertError } = await supabase.from("zone_profiles").insert(
        selectedProfileIds.map((profileId) => ({
          zone_id: teamZone.id,
          profile_id: profileId,
        })),
      );
      if (insertError) {
        setSavingTeam(false);
        toast.error(insertError.message);
        return;
      }
    }

    setSavingTeam(false);
    toast.success("تم حفظ فريق المنطقة.");
    closeTeamModal();
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" dir="rtl" lang="ar">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">إدارة المناطق</h1>
        <button
          className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700"
          onClick={openCreateModal}
        >
          + إضافة منطقة
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">جاري تحميل المناطق...</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-right text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-700">
              <tr>
                <th className="px-3 py-2">الاسم</th>
                <th className="px-3 py-2">خط العرض</th>
                <th className="px-3 py-2">خط الطول</th>
                <th className="px-3 py-2">العمليات</th>
              </tr>
            </thead>
            <tbody>
              {zones.map((zone) => (
                <tr key={zone.id} className="border-b border-slate-100">
                  <td className="px-3 py-2">{zone.name}</td>
                  <td className="px-3 py-2">{zone.center_latitude ?? "-"}</td>
                  <td className="px-3 py-2">{zone.center_longitude ?? "-"}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        className="rounded-md border border-slate-200 px-3 py-1.5 text-xs hover:bg-slate-50"
                        onClick={() => openEditModal(zone)}
                      >
                        تعديل
                      </button>
                      <button
                        className="rounded-md border border-indigo-200 px-3 py-1.5 text-xs text-indigo-700 hover:bg-indigo-50"
                        onClick={() => void openTeamModal(zone)}
                      >
                        فريق المنطقة
                      </button>
                      <button
                        className="rounded-md border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                        onClick={() => void deleteZone(zone)}
                        disabled={isDeletingId === zone.id}
                      >
                        {isDeletingId === zone.id ? "جاري الحذف..." : "حذف"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {zones.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-slate-500">
                    لا توجد مناطق مسجلة حالياً.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={closeModal}>
          <div className="w-full max-w-xl rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">{modalTitle}</h3>
              <button
                className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                onClick={closeModal}
              >
                X
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <p className="mb-2 text-sm font-medium">اسم المنطقة</p>
                <Input
                  value={formName}
                  onChange={(e) => {
                    setFormName(e.target.value);
                    setErrors((prev) => ({ ...prev, name: undefined }));
                  }}
                  placeholder="مثال: مخيم رقم 10"
                />
                {errors.name ? <p className="mt-1 text-xs text-red-600">{errors.name}</p> : null}
              </div>

              <div>
                <p className="mb-2 text-sm font-medium">حدد موقع المنطقة على الخريطة</p>
                <div className="h-56 overflow-hidden rounded-md border border-slate-200">
                  <ZonePickerMap
                    center={miniMapCenter}
                    mapTiles={mapTiles}
                    latitude={formLatitude}
                    longitude={formLongitude}
                    onPick={(lat, lng) => {
                      setFormLatitude(lat);
                      setFormLongitude(lng);
                      setErrors((prev) => ({ ...prev, map: undefined }));
                    }}
                  />
                </div>
                <p className="mt-2 text-xs text-slate-600">اضغط على الخريطة لتحديد الإحداثيات بدقة.</p>
                {formLatitude !== null && formLongitude !== null ? (
                  <p className="mt-1 text-xs text-slate-600">
                    الإحداثيات: {formLatitude}, {formLongitude}
                  </p>
                ) : null}
                {errors.map ? <p className="mt-1 text-xs text-red-600">{errors.map}</p> : null}
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                onClick={closeModal}
                disabled={isSubmitting}
              >
                إلغاء
              </button>
              <button
                className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => void saveZone()}
                disabled={isSubmitting}
              >
                {isSubmitting ? "جاري الحفظ..." : editingZone ? "حفظ التعديلات" : "إضافة المنطقة"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {teamModalOpen && teamZone ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={closeTeamModal}>
          <div className="w-full max-w-xl rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">فريق المنطقة: {teamZone.name}</h3>
              <button
                className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                onClick={closeTeamModal}
              >
                X
              </button>
            </div>

            <p className="mb-3 text-sm text-slate-600">
              حدد المستخدمين الذين ستصلهم إشعارات بلاغات هذه المنطقة ويستطيعون متابعتها.
            </p>
            <div className="max-h-80 space-y-2 overflow-y-auto rounded-md border border-slate-200 p-2">
              {profiles.map((profile) => (
                <label key={profile.id} className="flex cursor-pointer items-center justify-between rounded-md p-2 hover:bg-slate-50">
                  <div>
                    <p className="text-sm font-medium">{profile.full_name}</p>
                    <p className="text-xs text-slate-500">{profile.role}</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={selectedProfileIds.includes(profile.id)}
                    onChange={() => toggleProfile(profile.id)}
                  />
                </label>
              ))}
              {profiles.length === 0 ? <p className="text-sm text-slate-500">لا يوجد مستخدمون.</p> : null}
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                onClick={closeTeamModal}
                disabled={savingTeam}
              >
                إلغاء
              </button>
              <button
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => void saveZoneTeam()}
                disabled={savingTeam}
              >
                {savingTeam ? "جاري الحفظ..." : "حفظ الفريق"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

