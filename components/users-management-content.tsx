"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { APP_PERMISSION_KEYS, effectivePermissions, type AppPermissionKey } from "@/lib/permissions";

const PERM_LABELS_AR: Record<AppPermissionKey, string> = {
  view_dashboard: "لوحة التحكم",
  view_tickets: "البلاغات والمهام",
  view_map: "الخريطة التفاعلية",
  view_reports: "التقارير والمؤشرات",
  manage_zones: "إدارة المناطق",
  manage_users: "إدارة المستخدمين",
  view_settings: "الإعدادات",
};

function PermToggle({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900/50">
      <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-7 w-12 shrink-0 rounded-full transition-colors focus-visible:outline focus-visible:ring-2 focus-visible:ring-green-600",
          checked ? "bg-green-600" : "bg-slate-300 dark:bg-slate-600",
          disabled && "cursor-not-allowed opacity-50",
        )}
        aria-label={label}
      >
        <span
          className={cn(
            "absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all",
            checked ? "left-5" : "left-0.5",
          )}
        />
      </button>
    </div>
  );
}

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
  region?: string;
  permissions?: Record<string, unknown>;
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
    password?: string;
  }>({});

  const [inviteMode, setInviteMode] = useState<"invite" | "direct_password">("invite");
  const [invitePassword, setInvitePassword] = useState("");

  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState<UserRole>("technician");
  const [editRegion, setEditRegion] = useState("");
  const [editSpecialty, setEditSpecialty] = useState<Specialty>("civil");
  const [editZoneIds, setEditZoneIds] = useState<string[]>([]);
  const [permToggles, setPermToggles] = useState<Record<AppPermissionKey, boolean> | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editZoneDropdownOpen, setEditZoneDropdownOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

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
    setInviteMode("invite");
    setInvitePassword("");
  };

  const validateInvite = () => {
    const nextErrors: {
      full_name?: string;
      email?: string;
      mobile?: string;
      job_title?: string;
      zone_ids?: string;
      password?: string;
    } = {};

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
    if (inviteMode === "direct_password") {
      if (!invitePassword.trim() || invitePassword.trim().length < 8) {
        nextErrors.password = "كلمة المرور مطلوبة (8 أحرف على الأقل)";
      }
    }

    setInviteErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const inviteUser = async () => {
    if (!validateInvite()) return;

    setInviting(true);
    const payload: Record<string, unknown> = {
      mode: inviteMode,
      full_name: inviteName.trim(),
      email: inviteEmail.trim(),
      mobile: inviteMobile.trim(),
      job_title: inviteJobTitle.trim(),
      specialty: inviteSpecialty,
      zone_ids: inviteZoneIds,
      role: inviteRole,
    };
    if (inviteMode === "direct_password") {
      payload.password = invitePassword.trim();
    }
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as { ok?: boolean; error?: string };
    setInviting(false);

    if (!res.ok || !data.ok) {
      toast.error(data.error ?? "فشل إضافة المستخدم.");
      return;
    }

    toast.success(inviteMode === "direct_password" ? "تم إنشاء الحساب وتفعيله بنجاح." : "تم إرسال دعوة المستخدم بنجاح.");
    closeInviteModal();
    await loadUsers();
  };

  const selectedZones = zones.filter((zone) => inviteZoneIds.includes(zone.id));
  const selectedEditZones = zones.filter((zone) => editZoneIds.includes(zone.id));
  const toggleZoneSelection = (zoneId: string) => {
    setInviteZoneIds((prev) => (prev.includes(zoneId) ? prev.filter((id) => id !== zoneId) : [...prev, zoneId]));
    setInviteErrors((prev) => ({ ...prev, zone_ids: undefined }));
  };

  const toggleEditZoneSelection = (zoneId: string) => {
    setEditZoneIds((prev) => (prev.includes(zoneId) ? prev.filter((id) => id !== zoneId) : [...prev, zoneId]));
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

  const openEditUser = (user: UserRow) => {
    setEditingUser(user);
    setEditName(user.full_name);
    setEditRole(user.role);
    setEditRegion(user.region ?? "");
    setEditSpecialty((user.specialty as Specialty) ?? "civil");
    setEditZoneIds((user.zones ?? []).map((z) => z.id));
    setPermToggles(effectivePermissions(user.role, user.permissions ?? undefined));
    setEditZoneDropdownOpen(false);
    setDeleteConfirm(false);
  };

  const closeEditUser = () => {
    setEditingUser(null);
    setDeleteConfirm(false);
  };

  const saveEditUser = async () => {
    if (!editingUser) return;
    if (!editName.trim()) {
      toast.error("الاسم مطلوب.");
      return;
    }
    setEditSaving(true);
    const patchBody: Record<string, unknown> = {
      full_name: editName.trim(),
      role: editRole,
      region: editRegion.trim() || null,
      specialty: editSpecialty,
      zone_ids: editZoneIds,
    };
    if (editRole !== "admin" && permToggles) {
      patchBody.permissions = {
        ...permToggles,
        view_admin_reports: permToggles.view_reports,
      };
    }
    const res = await fetch(`/api/admin/users/${editingUser.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patchBody),
    });
    const data = (await res.json()) as { ok?: boolean; error?: string };
    setEditSaving(false);
    if (!res.ok || !data.ok) {
      toast.error(data.error ?? "فشل حفظ البيانات.");
      return;
    }
    toast.success("تم تحديث بيانات المستخدم.");
    closeEditUser();
    await loadUsers();
  };

  const deleteEditingUser = async () => {
    if (!editingUser) return;
    setEditSaving(true);
    const res = await fetch(`/api/admin/users/${editingUser.id}`, { method: "DELETE" });
    const data = (await res.json()) as { ok?: boolean; error?: string };
    setEditSaving(false);
    if (!res.ok || !data.ok) {
      toast.error(data.error ?? "تعذر حذف المستخدم.");
      return;
    }
    toast.success("تم حذف المستخدم.");
    closeEditUser();
    await loadUsers();
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
                <th className="px-3 py-2">الصلاحيات السريعة</th>
                <th className="px-3 py-2">البيانات</th>
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
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
                      onClick={() => openEditUser(user)}
                    >
                      تعديل البيانات
                    </button>
                  </td>
                </tr>
              ))}
              {users.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-slate-500">
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

            <div className="mb-4 flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-900/50">
              <button
                type="button"
                className={cn(
                  "flex-1 rounded-md px-3 py-2 text-sm font-medium transition",
                  inviteMode === "invite"
                    ? "bg-white text-slate-900 shadow dark:bg-slate-800 dark:text-slate-50"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400",
                )}
                onClick={() => {
                  setInviteMode("invite");
                  setInviteErrors((e) => ({ ...e, password: undefined }));
                }}
              >
                دعوة بالبريد
              </button>
              <button
                type="button"
                className={cn(
                  "flex-1 rounded-md px-3 py-2 text-sm font-medium transition",
                  inviteMode === "direct_password"
                    ? "bg-white text-slate-900 shadow dark:bg-slate-800 dark:text-slate-50"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400",
                )}
                onClick={() => {
                  setInviteMode("direct_password");
                  setInviteErrors((e) => ({ ...e, password: undefined }));
                }}
              >
                إنشاء فوري (بريد + كلمة مرور)
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
                <p className="mb-2 text-sm font-medium">البريد الإلكتروني (اسم الدخول)</p>
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

              {inviteMode === "direct_password" ? (
                <div>
                  <p className="mb-2 text-sm font-medium">كلمة المرور</p>
                  <Input
                    type="password"
                    autoComplete="new-password"
                    value={invitePassword}
                    onChange={(e) => {
                      setInvitePassword(e.target.value);
                      setInviteErrors((prev) => ({ ...prev, password: undefined }));
                    }}
                    placeholder="8 أحرف على الأقل"
                  />
                  {inviteErrors.password ? <p className="mt-1 text-xs text-red-600">{inviteErrors.password}</p> : null}
                </div>
              ) : null}

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
                {inviting ? "جاري المعالجة..." : inviteMode === "direct_password" ? "إنشاء الحساب وتفعيله" : "إرسال الدعوة"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editingUser ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={closeEditUser}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">تعديل المستخدم</h3>
              <button type="button" className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100" onClick={closeEditUser}>
                X
              </button>
            </div>
            <p className="mb-3 text-xs text-slate-500">{editingUser.email}</p>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <p className="mb-1 text-sm font-medium">الاسم الكامل</p>
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
              </div>
              <div>
                <p className="mb-1 text-sm font-medium">الرتبة</p>
                <select
                  className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                  value={editRole}
                  onChange={(e) => {
                    const nr = e.target.value as UserRole;
                    setEditRole(nr);
                    setPermToggles(effectivePermissions(nr, editingUser.permissions ?? undefined));
                  }}
                >
                  {ROLE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <p className="mb-1 text-sm font-medium">التخصص</p>
                <select
                  className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                  value={editSpecialty}
                  onChange={(e) => setEditSpecialty(e.target.value as Specialty)}
                >
                  {SPECIALTY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <p className="mb-1 text-sm font-medium">المنطقة (نص مرجعي يطابق اسم المنطة إن لزم)</p>
                <Input value={editRegion} onChange={(e) => setEditRegion(e.target.value)} placeholder="مثال: المعيصم" />
              </div>
              <div className="md:col-span-2">
                <p className="mb-2 text-sm font-medium">ربط المناطق (تشغيل)</p>
                <button
                  type="button"
                  className="flex h-10 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 text-sm"
                  onClick={() => setEditZoneDropdownOpen((prev) => !prev)}
                >
                  <span className="truncate text-right">
                    {selectedEditZones.length === 0 ? "بدون مناطق" : selectedEditZones.map((z) => z.name).join("، ")}
                  </span>
                  <span className="text-xs text-slate-500">{selectedEditZones.length} محدد</span>
                </button>
                {editZoneDropdownOpen ? (
                  <div className="mt-2 max-h-56 space-y-1 overflow-y-auto rounded-md border border-slate-200 bg-white p-2">
                    {zones.map((zone) => (
                      <label key={zone.id} className="flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 hover:bg-slate-50">
                        <span className="text-sm">{zone.name}</span>
                        <input type="checkbox" checked={editZoneIds.includes(zone.id)} onChange={() => toggleEditZoneSelection(zone.id)} />
                      </label>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="md:col-span-2 space-y-2">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">صلاحيات الواجهة</p>
                {editRole === "admin" ? (
                  <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300">
                    مدير النظام يملك جميع الصلاحيات تلقائياً.
                  </p>
                ) : (
                  APP_PERMISSION_KEYS.map((key) => (
                    <PermToggle
                      key={key}
                      label={PERM_LABELS_AR[key]}
                      checked={Boolean(permToggles?.[key])}
                      onChange={(v) =>
                        setPermToggles((prev) => {
                          const base =
                            prev ?? effectivePermissions(editRole, editingUser.permissions ?? undefined);
                          return { ...base, [key]: v };
                        })
                      }
                    />
                  ))
                )}
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-2">
                {deleteConfirm ? (
                  <>
                    <button
                      type="button"
                      className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
                      disabled={editSaving}
                      onClick={() => void deleteEditingUser()}
                    >
                      {editSaving ? "جاري الحذف..." : "تأكيد الحذف نهائياً"}
                    </button>
                    <button type="button" className="rounded-md border border-slate-200 px-4 py-2 text-sm" onClick={() => setDeleteConfirm(false)}>
                      إلغاء
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="rounded-md border border-red-200 px-4 py-2 text-sm text-red-700 hover:bg-red-50"
                    onClick={() => setDeleteConfirm(true)}
                  >
                    حذف المستخدم
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button type="button" className="rounded-md border border-slate-200 px-4 py-2 text-sm" onClick={closeEditUser} disabled={editSaving}>
                  إلغاء
                </button>
                <button
                  type="button"
                  className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
                  disabled={editSaving}
                  onClick={() => void saveEditUser()}
                >
                  {editSaving ? "جاري الحفظ..." : "حفظ التغييرات"}
                </button>
              </div>
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

