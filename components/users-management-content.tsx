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
  account_status: string;
};

const ROLE_OPTIONS: Array<{ value: UserRole; label: string }> = [
  { value: "admin", label: "مدير النظام" },
  { value: "projects_director", label: "مدير المشاريع" },
  { value: "project_manager", label: "مدير مشروع" },
  { value: "reporter", label: "مدخل بيانات" },
  { value: "engineer", label: "مهندس" },
  { value: "supervisor", label: "مشرف" },
  { value: "technician", label: "فني" },
];

export function UsersManagementContent() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [draftRoleMap, setDraftRoleMap] = useState<Record<string, UserRole>>({});
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteMobile, setInviteMobile] = useState("");
  const [inviteRole, setInviteRole] = useState<UserRole>("technician");
  const [inviteErrors, setInviteErrors] = useState<{
    full_name?: string;
    email?: string;
    mobile?: string;
  }>({});

  const loadUsers = async () => {
    setLoading(true);
    const res = await fetch("/api/admin/users", { cache: "no-store" });
    const data = (await res.json()) as { users?: UserRow[]; error?: string };

    if (!res.ok) {
      toast.error(data.error ?? "فشل تحميل المستخدمين.");
      setLoading(false);
      return;
    }

    const rows = data.users ?? [];
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
    setInviteRole("technician");
    setInviteErrors({});
  };

  const validateInvite = () => {
    const nextErrors: { full_name?: string; email?: string; mobile?: string } = {};

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

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" dir="rtl" lang="ar">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">إدارة المستخدمين</h1>
        <button
          className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700"
          onClick={() => setIsInviteModalOpen(true)}
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
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
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
          <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">إضافة مستخدم جديد</h3>
              <button
                className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                onClick={closeInviteModal}
              >
                X
              </button>
            </div>

            <div className="space-y-4">
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
    </section>
  );
}

