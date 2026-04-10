"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";

type UserRole =
  | "admin"
  | "projects_director"
  | "project_manager"
  | "engineer"
  | "supervisor"
  | "technician"
  | "reporter";

type UserRow = {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  mobile: string;
  job_title?: string;
  specialty?: string;
  zones?: Array<{ id: string; name: string }>;
  account_status: string;
};

type ZoneOption = {
  id: string;
  name: string;
};

type Specialty = "fire" | "electricity" | "ac" | "civil" | "kitchens";

const ROLE_OPTIONS: Array<{ value: UserRole; label: string }> = [
  { value: "admin", label: "مدير النظام" },
  { value: "projects_director", label: "مدير المشاريع" },
  { value: "project_manager", label: "مدير مشروع" },
  { value: "reporter", label: "مدخل بيانات" },
  { value: "engineer", label: "مهندس" },
  { value: "supervisor", label: "مشرف" },
  { value: "technician", label: "فني" },
];

const SPECIALTY_OPTIONS: Array<{ value: Specialty; label: string }> = [
  { value: "fire", label: "حريق" },
  { value: "electricity", label: "كهرباء" },
  { value: "ac", label: "تكييف" },
  { value: "civil", label: "مدني" },
  { value: "kitchens", label: "مطابخ" },
];

export function UsersManagementContent() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [draftRoleMap, setDraftRoleMap] = useState<Record<string, UserRole>>({});
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [zones, setZones] = useState<ZoneOption[]>([]);
  const [zonesLoading, setZonesLoading] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteMobile, setInviteMobile] = useState("");
  const [inviteJobTitle, setInviteJobTitle] = useState("");
  const [inviteSpecialty, setInviteSpecialty] = useState<Specialty>("civil");
  const [inviteZoneIds, setInviteZoneIds] = useState<string[]>([]);
  const [zoneDropdownOpen, setZoneDropdownOpen] = useState(false);
  const [inviteRole, setInviteRole] = useState<UserRole>("technician");
  const [passwordModalUser, setPasswordModalUser] = useState<UserRow | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [inviteErrors, setInviteErrors] = useState<{
    full_name?: string;
    email?: string;
    mobile?: string;
    job_title?: string;
    zone_ids?: string;
  }>({});

  const loadUsers = async () => {
    setLoading(true);
    const res = await fetch("/api/admin/users", { cache: "no-store" });
    const data = (await res.json()) as { users?: UserRow[]; zones?: ZoneOption[]; error?: string };

    if (!res.ok) {
      toast.error(data.error ?? "فشل تحميل المستخدمين.");
      setLoading(false);
      return;
    }

    const rows = data.users ?? [];
    setZones(data.zones ?? []);
    setUsers(rows);
    setDraftRoleMap(
      rows.reduce<Record<string, UserRole>>((acc, row) => {
        acc[row.id] = row.role;
        return acc;
      }, {}),
    );
    setLoading(false);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadUsers();
  }, []);

  const saveRole = async (user: UserRow) => {
    const nextRole = draftRoleMap[user.id];
    if (!nextRole || nextRole === user.role) return;

    setSavingUserId(user.id);
    const res = await fetch(`/api/admin/users/${user.id}/role`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: nextRole }),
    });
    const data = (await res.json()) as { ok?: boolean; error?: string };
    setSavingUserId(null);

    if (!res.ok || !data.ok) {
      toast.error(data.error ?? "فشل تحديث الصلاحية.");
      return;
    }

    toast.success("تم تعديل الصلاحيات بنجاح.");
    await loadUsers();
  };

  const closeInviteModal = () => {
    setIsInviteModalOpen(false);
    setInviteName("");
    setInviteEmail("");
    setInviteMobile("");
    setInviteJobTitle("");
    setInviteSpecialty("civil");
    setInviteZoneIds([]);
    setZoneDropdownOpen(false);
    setInviteRole("technician");
    setInviteErrors({});
  };

  const validateInvite = () => {
    const nextErrors: { full_name?: string; email?: string; mobile?: string; job_title?: string; zone_ids?: string } = {};

    if (!inviteName.trim()) {
      nextErrors.full_name = "هذا الحقل مطلوب";
    }
    if (!inviteEmail.trim()) {
      nextErrors.email = "هذا الحقل مطلوب";
    } else if (!/\S+@\S+\.\S+/.test(inviteEmail.trim())) {
      nextErrors.email = "يرجى إدخال بريد إلكتروني صحيح";
    }
    if (!inviteMobile.trim()) {
      nextErrors.mobile = "هذا الحقل مطلوب";
    }
    if (!inviteJobTitle.trim()) {
      nextErrors.job_title = "هذا الحقل مطلوب";
    }
    if (inviteZoneIds.length === 0) {
      nextErrors.zone_ids = "يرجى اختيار منطقة واحدة على الأقل";
    }

    setInviteErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const inviteUser = async () => {
    if (!validateInvite()) return;

    setInviting(true);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        full_name: inviteName.trim(),
        email: inviteEmail.trim(),
        mobile: inviteMobile.trim(),
        job_title: inviteJobTitle.trim(),
        specialty: inviteSpecialty,
        zone_ids: inviteZoneIds,
        role: inviteRole,
      }),
    });
    const data = (await res.json()) as { ok?: boolean; error?: string };
    setInviting(false);

    if (!res.ok || !data.ok) {
      toast.error(data.error ?? "فشل إضافة المستخدم.");
      return;
    }

    toast.success("تم إرسال دعوة المستخدم بنجاح.");
    closeInviteModal();
    await loadUsers();
  };

  const selectedZones = zones.filter((zone) => inviteZoneIds.includes(zone.id));
  const toggleZoneSelection = (zoneId: string) => {
    setInviteZoneIds((prev) => (prev.includes(zoneId) ? prev.filter((id) => id !== zoneId) : [...prev, zoneId]));
    setInviteErrors((prev) => ({ ...prev, zone_ids: undefined }));
  };

  const openInviteModal = async () => {
    setIsInviteModalOpen(true);
    if (zones.length > 0) return;
    setZonesLoading(true);
    await loadUsers();
    setZonesLoading(false);
  };

  const openPasswordModal = (user: UserRow) => {
    setPasswordModalUser(user);
    setNewPassword("");
    setPasswordError(null);
  };

  const closePasswordModal = () => {
    setPasswordModalUser(null);
    setNewPassword("");
    setPasswordError(null);
  };

  const saveUserPassword = async () => {
    if (!passwordModalUser) return;
    if (newPassword.trim().length < 8) {
      setPasswordError("كلمة المرور يجب أن تكون 8 أحرف على الأقل.");
      return;
    }
    setPasswordSaving(true);
    setPasswordError(null);
    const res = await fetch(`/api/admin/users/${passwordModalUser.id}/password`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: newPassword.trim() }),
    });
    const data = (await res.json()) as { ok?: boolean; error?: string };
    setPasswordSaving(false);
    if (!res.ok || !data.ok) {
      setPasswordError(data.error ?? "فشل تغيير كلمة المرور.");
      return;
    }
    toast.success("تم تغيير كلمة المرور بنجاح.");
    closePasswordModal();
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" dir="rtl" lang="ar">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">إدارة المستخدمين</h1>
        <button
          className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700"
          onClick={() => void openInviteModal()}
        >
          إضافة مستخدم جديد
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">جاري تحميل المستخدمين...</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-right text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-700">
              <tr>
                <th className="px-3 py-2">الاسم</th>
                <th className="px-3 py-2">الإيميل</th>
                <th className="px-3 py-2">رقم الجوال</th>
                <th className="px-3 py-2">المهنة</th>
                <th className="px-3 py-2">التصنيف</th>
                <th className="px-3 py-2">المناطق</th>
                <th className="px-3 py-2">الدور</th>
                <th className="px-3 py-2">حالة الحساب</th>
                <th className="px-3 py-2">تعديل الصلاحيات</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b border-slate-100">
                  <td className="px-3 py-2">{user.full_name}</td>
                  <td className="px-3 py-2">{user.email}</td>
                  <td className="px-3 py-2">{user.mobile}</td>
                  <td className="px-3 py-2">{user.job_title || "-"}</td>
                  <td className="px-3 py-2">
                    {SPECIALTY_OPTIONS.find((option) => option.value === user.specialty)?.label ?? "-"}
                  </td>
                  <td className="px-3 py-2">
                    {(user.zones ?? []).length > 0 ? (user.zones ?? []).map((zone) => zone.name).join("، ") : "-"}
                  </td>
                  <td className="px-3 py-2">
                    {ROLE_OPTIONS.find((option) => option.value === user.role)?.label ?? user.role}
                  </td>
                  <td className="px-3 py-2">{user.account_status}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-2">
                      <select
                        className="h-9 rounded-md border border-slate-200 bg-white px-3 text-xs"
                        value={draftRoleMap[user.id] ?? user.role}
                        onChange={(e) =>
                          setDraftRoleMap((prev) => ({
                            ...prev,
                            [user.id]: e.target.value as UserRole,
                          }))
                        }
                      >
                        {ROLE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <button
                        className="rounded-md border border-slate-200 px-3 py-1.5 text-xs hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                        onClick={() => void saveRole(user)}
                        disabled={savingUserId === user.id || (draftRoleMap[user.id] ?? user.role) === user.role}
                      >
                        {savingUserId === user.id ? "جاري الحفظ..." : "حفظ"}
                      </button>
                      <button
                        className="rounded-md border border-emerald-200 px-3 py-1.5 text-xs text-emerald-700 hover:bg-emerald-50"
                        onClick={() => openPasswordModal(user)}
                      >
                        تغيير الباسورد
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-slate-500">
                    لا يوجد مستخدمون حالياً.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}

      {isInviteModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={closeInviteModal}>
          <div className="w-full max-w-2xl rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">إضافة مستخدم جديد</h3>
              <button
                className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                onClick={closeInviteModal}
              >
                X
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="mb-2 text-sm font-medium">الاسم الكامل</p>
                <Input
                  value={inviteName}
                  onChange={(e) => {
                    setInviteName(e.target.value);
                    setInviteErrors((prev) => ({ ...prev, full_name: undefined }));
                  }}
                  placeholder="مثال: أحمد محمد"
                />
                {inviteErrors.full_name ? <p className="mt-1 text-xs text-red-600">{inviteErrors.full_name}</p> : null}
              </div>

              <div>
                <p className="mb-2 text-sm font-medium">الإيميل</p>
                <Input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => {
                    setInviteEmail(e.target.value);
                    setInviteErrors((prev) => ({ ...prev, email: undefined }));
                  }}
                  placeholder="name@company.com"
                />
                {inviteErrors.email ? <p className="mt-1 text-xs text-red-600">{inviteErrors.email}</p> : null}
              </div>

              <div>
                <p className="mb-2 text-sm font-medium">رقم الجوال</p>
                <Input
                  value={inviteMobile}
                  onChange={(e) => {
                    setInviteMobile(e.target.value);
                    setInviteErrors((prev) => ({ ...prev, mobile: undefined }));
                  }}
                  placeholder="05XXXXXXXX"
                />
                {inviteErrors.mobile ? <p className="mt-1 text-xs text-red-600">{inviteErrors.mobile}</p> : null}
              </div>

              <div>
                <p className="mb-2 text-sm font-medium">المهنة / المسمى الوظيفي</p>
                <Input
                  value={inviteJobTitle}
                  onChange={(e) => {
                    setInviteJobTitle(e.target.value);
                    setInviteErrors((prev) => ({ ...prev, job_title: undefined }));
                  }}
                  placeholder="مثال: فني كهرباء أول"
                />
                {inviteErrors.job_title ? <p className="mt-1 text-xs text-red-600">{inviteErrors.job_title}</p> : null}
              </div>

              <div>
                <p className="mb-2 text-sm font-medium">التصنيف</p>
                <select
                  className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                  value={inviteSpecialty}
                  onChange={(e) => setInviteSpecialty(e.target.value as Specialty)}
                >
                  {SPECIALTY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <p className="mb-2 text-sm font-medium">الدور</p>
                <select
                  className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as UserRole)}
                >
                  {ROLE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <p className="mb-2 text-sm font-medium">المناطق (اختيار متعدد)</p>
                <button
                  type="button"
                  className="flex h-10 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 text-sm"
                  onClick={() => setZoneDropdownOpen((prev) => !prev)}
                >
                  <span className="truncate text-right">
                    {selectedZones.length === 0 ? "اختر منطقة أو أكثر" : selectedZones.map((zone) => zone.name).join("، ")}
                  </span>
                  <span className="text-xs text-slate-500">{selectedZones.length} محدد</span>
                </button>
                {zoneDropdownOpen ? (
                  <div className="mt-2 max-h-56 space-y-1 overflow-y-auto rounded-md border border-slate-200 bg-white p-2">
                    {zonesLoading ? <p className="p-2 text-xs text-slate-500">جاري تحميل المناطق...</p> : null}
                    {!zonesLoading && zones.length === 0 ? <p className="p-2 text-xs text-slate-500">لا توجد مناطق متاحة.</p> : null}
                    {zones.map((zone) => (
                      <label key={zone.id} className="flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 hover:bg-slate-50">
                        <span className="text-sm">{zone.name}</span>
                        <input
                          type="checkbox"
                          checked={inviteZoneIds.includes(zone.id)}
                          onChange={() => toggleZoneSelection(zone.id)}
                        />
                      </label>
                    ))}
                  </div>
                ) : null}
                {selectedZones.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {selectedZones.map((zone) => (
                      <span key={zone.id} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs">
                        {zone.name}
                      </span>
                    ))}
                  </div>
                ) : null}
                {inviteErrors.zone_ids ? <p className="mt-1 text-xs text-red-600">{inviteErrors.zone_ids}</p> : null}
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                onClick={closeInviteModal}
                disabled={inviting}
              >
                إلغاء
              </button>
              <button
                className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => void inviteUser()}
                disabled={inviting}
              >
                {inviting ? "جاري الإرسال..." : "إرسال الدعوة"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {passwordModalUser ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={closePasswordModal}>
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">تغيير الباسورد</h3>
              <button
                className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                onClick={closePasswordModal}
              >
                X
              </button>
            </div>
            <p className="mb-2 text-sm text-slate-600">المستخدم: {passwordModalUser.full_name}</p>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="أدخل كلمة المرور الجديدة"
            />
            {passwordError ? <p className="mt-2 text-xs text-red-600">{passwordError}</p> : null}
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                onClick={closePasswordModal}
                disabled={passwordSaving}
              >
                إلغاء
              </button>
              <button
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => void saveUserPassword()}
                disabled={passwordSaving}
              >
                {passwordSaving ? "جاري الحفظ..." : "حفظ كلمة المرور"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

