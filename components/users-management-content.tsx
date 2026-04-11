"use client";

import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { APP_PERMISSION_KEYS, effectivePermissions, type AppPermissionKey } from "@/lib/permissions";
import { displayLoginIdentifier, parseUsernameOrEmailLocalPart } from "@/lib/username-auth";

const PERM_LABELS_AR: Record<AppPermissionKey, string> = {
  view_dashboard: "لوحة التحكم",
  view_tickets: "البلاغات والمهام",
  view_map: "الخريطة التفاعلية",
  view_reports: "التقارير والمؤشرات",
  manage_zones: "إدارة المناطق",
  manage_users: "إدارة المستخدمين",
  view_settings: "الإعدادات",
};

/** تبديل مضغوط لصفوف الجدول — أخضر عند التفعيل، رمادي عند الإيقاف */
function TablePermSwitch({
  checked,
  disabled,
  saving,
  ariaLabel,
  onToggle,
}: {
  checked: boolean;
  disabled?: boolean;
  saving?: boolean;
  ariaLabel: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled || saving}
      onClick={onToggle}
      className={cn(
        "relative mx-auto block h-7 w-[2.75rem] shrink-0 rounded-full transition-colors focus-visible:outline focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1",
        checked
          ? "bg-emerald-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]"
          : "bg-slate-300 dark:bg-slate-600",
        (disabled || saving) && "cursor-not-allowed opacity-60",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all",
          checked ? "start-5" : "start-0.5",
        )}
      />
    </button>
  );
}

const USERS_TABLE_PAGE_SIZE = 20;

const TABLE_QUICK_PERMS: { key: AppPermissionKey; header: string }[] = [
  { key: "view_map", header: "الخريطة" },
  { key: "view_reports", header: "التقارير" },
  { key: "manage_zones", header: "إدارة المناطق" },
];

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
  /** بريد Supabase الداخلي */
  email: string;
  /** اسم الدخول الظاهر */
  username: string;
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
  const queryClient = useQueryClient();
  const [usersTablePage, setUsersTablePage] = useState(1);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [draftRoleMap, setDraftRoleMap] = useState<Record<string, UserRole>>({});
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteUsername, setInviteUsername] = useState("");
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
    username?: string;
    mobile?: string;
    job_title?: string;
    zone_ids?: string;
    password?: string;
  }>({});

  const [invitePassword, setInvitePassword] = useState("");
  const [invitePermToggles, setInvitePermToggles] = useState<Record<AppPermissionKey, boolean>>(() =>
    effectivePermissions("technician", undefined),
  );
  const [bulkUploading, setBulkUploading] = useState(false);
  const [templateDownloading, setTemplateDownloading] = useState<"xlsx" | "csv" | null>(null);

  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState<UserRole>("technician");
  const [editRegion, setEditRegion] = useState("");
  const [editSpecialty, setEditSpecialty] = useState<Specialty>("civil");
  const [editZoneIds, setEditZoneIds] = useState<string[]>([]);
  const [editUsername, setEditUsername] = useState("");
  const [permToggles, setPermToggles] = useState<Record<AppPermissionKey, boolean> | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editZoneDropdownOpen, setEditZoneDropdownOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [permRowSaving, setPermRowSaving] = useState<string | null>(null);
  const [quickDeleteId, setQuickDeleteId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const fetchAdminUsersPage = useCallback(async (page: number) => {
    const res = await fetch(`/api/admin/users?page=${page}&limit=${USERS_TABLE_PAGE_SIZE}`, {
      cache: "no-store",
    });
    const json = (await res.json()) as {
      users?: UserRow[];
      zones?: ZoneOption[];
      total?: number;
      error?: string;
    };
    if (!res.ok) {
      throw new Error(json.error ?? "فشل تحميل المستخدمين.");
    }
    return {
      users: json.users ?? [],
      zones: json.zones ?? [],
      total: json.total ?? 0,
    };
  }, []);

  const {
    data: usersQueryData,
    isLoading,
    isFetching,
    error: usersQueryError,
    refetch,
  } = useQuery({
    queryKey: ["admin-users", usersTablePage],
    queryFn: () => fetchAdminUsersPage(usersTablePage),
    placeholderData: (prev) => prev,
    staleTime: 60_000,
  });

  const users = usersQueryData?.users ?? [];
  const zones = usersQueryData?.zones ?? [];
  const usersTotal = usersQueryData?.total ?? 0;
  const usersTotalPages = Math.max(1, Math.ceil(usersTotal / USERS_TABLE_PAGE_SIZE));

  useEffect(() => {
    if (usersQueryError) {
      toast.error(usersQueryError.message);
    }
  }, [usersQueryError]);

  useEffect(() => {
    if (usersTablePage > usersTotalPages) {
      setUsersTablePage(usersTotalPages);
    }
  }, [usersTablePage, usersTotalPages]);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setCurrentUserId(data.session?.user.id ?? null);
    });
  }, []);

  useEffect(() => {
    if (!users.length) return;
    setDraftRoleMap(
      users.reduce<Record<string, UserRole>>((acc, row) => {
        acc[row.id] = row.role;
        return acc;
      }, {}),
    );
  }, [users]);

  const invalidateUsers = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
  }, [queryClient]);

  useEffect(() => {
    if (usersTablePage >= usersTotalPages) return;
    void queryClient.prefetchQuery({
      queryKey: ["admin-users", usersTablePage + 1],
      queryFn: () => fetchAdminUsersPage(usersTablePage + 1),
      staleTime: 60_000,
    });
  }, [usersTablePage, usersTotalPages, queryClient, fetchAdminUsersPage]);

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
    await invalidateUsers();
  };

  const saveTablePermission = async (user: UserRow, key: AppPermissionKey, newValue: boolean) => {
    if (user.role === "admin") {
      toast.info("مدير النظام يملك جميع الصلاحيات دائماً — لا يُعدّل من الجدول.");
      return;
    }
    const token = `${user.id}-${key}`;
    setPermRowSaving(token);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          permissions: {
            [key]: newValue,
            ...(key === "view_reports" ? { view_admin_reports: newValue } : {}),
          },
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? "فشل تحديث الصلاحية.");
        return;
      }
      toast.success(`${newValue ? "تم التفعيل" : "تم الإيقاف"}: ${PERM_LABELS_AR[key]}`);
      await invalidateUsers();
    } finally {
      setPermRowSaving(null);
    }
  };

  const quickDeleteUser = async (user: UserRow) => {
    if (user.id === currentUserId) {
      toast.error("لا يمكنك حذف حسابك أثناء الجلسة الحالية.");
      return;
    }
    if (!window.confirm(`حذف المستخدم «${user.full_name}» نهائياً من النظام؟`)) {
      return;
    }
    setQuickDeleteId(user.id);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? "تعذر حذف المستخدم.");
        return;
      }
      toast.success("تم حذف المستخدم.");
      await invalidateUsers();
    } finally {
      setQuickDeleteId(null);
    }
  };

  const closeInviteModal = () => {
    setIsInviteModalOpen(false);
    setInviteName("");
    setInviteUsername("");
    setInviteMobile("");
    setInviteJobTitle("");
    setInviteSpecialty("civil");
    setInviteZoneIds([]);
    setZoneDropdownOpen(false);
    setInviteRole("technician");
    setInviteErrors({});
    setInvitePassword("");
    setInvitePermToggles(effectivePermissions("technician", undefined));
  };

  const validateInvite = () => {
    const nextErrors: {
      full_name?: string;
      username?: string;
      mobile?: string;
      job_title?: string;
      zone_ids?: string;
      password?: string;
    } = {};

    if (!inviteName.trim()) {
      nextErrors.full_name = "هذا الحقل مطلوب";
    }
    if (!inviteUsername.trim()) {
      nextErrors.username = "اسم المستخدم مطلوب (حروف إنجليزية وأرقام)";
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
    if (!invitePassword.trim() || invitePassword.trim().length < 8) {
      nextErrors.password = "كلمة المرور مطلوبة (8 أحرف على الأقل)";
    }

    setInviteErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const inviteUser = async () => {
    if (!validateInvite()) return;

    setInviting(true);
    const payload: Record<string, unknown> = {
      mode: "direct_password",
      username: inviteUsername.trim(),
      password: invitePassword.trim(),
      full_name: inviteName.trim(),
      mobile: inviteMobile.trim(),
      job_title: inviteJobTitle.trim(),
      specialty: inviteSpecialty,
      zone_ids: inviteZoneIds,
      role: inviteRole,
      permissions:
        inviteRole === "admin"
          ? undefined
          : {
              ...invitePermToggles,
              view_admin_reports: invitePermToggles.view_reports,
            },
    };
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

    toast.success("تم إنشاء الحساب وتفعيله بنجاح.");
    closeInviteModal();
    await invalidateUsers();
  };

  const downloadBulkTemplate = async (format: "xlsx" | "csv") => {
    setTemplateDownloading(format);
    try {
      const res = await fetch(`/api/admin/users/bulk-template?format=${format}`);
      if (!res.ok) {
        let msg = "تعذر تنزيل النموذج.";
        try {
          const j = (await res.json()) as { error?: string };
          if (j.error) msg = j.error;
        } catch {
          /* blob error body */
        }
        toast.error(msg);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = format === "csv" ? "bulk-users-template.csv" : "bulk-users-template.xlsx";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("تم تنزيل النموذج.");
    } finally {
      setTemplateDownloading(null);
    }
  };

  const onBulkUsersFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBulkUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/users/bulk", { method: "POST", body: fd });
      const data = (await res.json()) as {
        ok?: boolean;
        created_count?: number;
        errors?: Array<{ row: number; message: string }>;
        error?: string;
      };
      if (!res.ok) {
        toast.error(data.error ?? "فشل الرفع.");
        return;
      }
      toast.success(`تم إنشاء ${data.created_count ?? 0} مستخدم.`);
      if (data.errors && data.errors.length > 0) {
        toast.error(
          `توجد ملاحظات على ${data.errors.length} صف (مثال: صف ${data.errors[0]?.row} — ${data.errors[0]?.message}).`,
        );
      }
      await invalidateUsers();
    } finally {
      setBulkUploading(false);
    }
  };

  useEffect(() => {
    if (!isInviteModalOpen) return;
    setInvitePermToggles(effectivePermissions(inviteRole, undefined));
  }, [inviteRole, isInviteModalOpen]);

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
    setInvitePermToggles(effectivePermissions("technician", undefined));
    if (zones.length > 0) return;
    await refetch();
  };

  const openPasswordModal = (user: UserRow) => {
    setPasswordModalUser(user);
    setNewPassword("");
    setPasswordError(null);
  };

  const openEditUser = (user: UserRow) => {
    setEditingUser(user);
    setEditUsername(
      displayLoginIdentifier(user.email && user.email !== "غير متوفر" ? user.email : null, user.username),
    );
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
    const normalizedUsername = parseUsernameOrEmailLocalPart(editUsername);
    if (!normalizedUsername) {
      toast.error("اسم المستخدم مطلوب (حروف إنجليزية وأرقام).");
      return;
    }
    setEditSaving(true);
    const patchBody: Record<string, unknown> = {
      username: normalizedUsername,
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
    await invalidateUsers();
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
    await invalidateUsers();
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
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">إدارة المستخدمين</h1>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={templateDownloading !== null || bulkUploading}
            onClick={() => void downloadBulkTemplate("xlsx")}
            className="rounded-md border border-emerald-600 bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50 dark:border-emerald-500 dark:bg-emerald-600"
          >
            {templateDownloading === "xlsx" ? "جاري التحميل…" : "تحميل نموذج الرفع"}
          </button>
          <button
            type="button"
            disabled={templateDownloading !== null || bulkUploading}
            onClick={() => void downloadBulkTemplate("csv")}
            className="rounded-md border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-900 shadow-sm ring-1 ring-emerald-200 transition hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100"
          >
            {templateDownloading === "csv" ? "جاري التحميل…" : "CSV"}
          </button>
          <label className="cursor-pointer rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:opacity-50">
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              disabled={bulkUploading || templateDownloading !== null}
              onChange={(e) => void onBulkUsersFile(e)}
            />
            {bulkUploading ? "جاري الرفع…" : "الرفع"}
          </label>
          <button
            className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700"
            onClick={() => void openInviteModal()}
          >
            إضافة مستخدم جديد
          </button>
        </div>
      </div>

      {isLoading && !usersQueryData ? (
        <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800">
          <div className="flex gap-2">
            <Skeleton className="h-10 flex-1" />
            <Skeleton className="h-10 w-24" />
          </div>
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <>
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800">
          <table className="min-w-[1100px] w-full border-collapse text-right text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-100 text-slate-800 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-100">
                <th className="sticky right-0 z-10 min-w-[8rem] bg-slate-100 px-3 py-3 font-semibold shadow-[4px_0_8px_-4px_rgba(0,0,0,0.08)] dark:bg-slate-900/80">
                  الاسم
                </th>
                <th className="px-3 py-3 font-semibold">اسم المستخدم</th>
                <th className="px-3 py-3 font-semibold">الجوال</th>
                <th className="px-3 py-3 font-semibold">المهنة</th>
                <th className="px-3 py-3 font-semibold">التصنيف</th>
                <th className="min-w-[7rem] px-3 py-3 font-semibold">المناطق</th>
                <th className="px-3 py-3 font-semibold">الدور</th>
                <th className="px-3 py-3 font-semibold">الحالة</th>
                {TABLE_QUICK_PERMS.map((col) => (
                  <th key={col.key} className="w-[5.5rem] min-w-[5.5rem] px-2 py-3 text-center text-xs font-semibold text-slate-700 dark:text-slate-200">
                    {col.header}
                  </th>
                ))}
                <th className="min-w-[12rem] px-3 py-3 font-semibold">تعيين الدور</th>
                <th className="px-3 py-3 font-semibold">البيانات</th>
                <th className="w-24 px-3 py-3 text-center font-semibold">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user, rowIdx) => {
                const eff = effectivePermissions(user.role, user.permissions ?? undefined);
                const isAdminRow = user.role === "admin";
                const globalRowIdx = (usersTablePage - 1) * USERS_TABLE_PAGE_SIZE + rowIdx;
                const zebraEven = globalRowIdx % 2 === 0;
                return (
                  <tr
                    key={user.id}
                    className={cn(
                      "border-b border-slate-100 transition-colors dark:border-slate-800",
                      zebraEven ? "bg-white dark:bg-slate-950" : "bg-slate-50/80 dark:bg-slate-900/40",
                    )}
                  >
                    <td
                      className={cn(
                        "sticky right-0 z-[1] px-3 py-2.5 font-medium text-slate-900 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.06)] dark:text-slate-50",
                        zebraEven ? "bg-white dark:bg-slate-950" : "bg-slate-50/80 dark:bg-slate-900/40",
                      )}
                    >
                      {user.full_name}
                    </td>
                    <td className="max-w-[10rem] truncate px-3 py-2.5 text-slate-700 dark:text-slate-300" title={user.username || user.email}>
                      {user.username || user.email}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-700 dark:text-slate-300">{user.mobile}</td>
                    <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">{user.job_title || "—"}</td>
                    <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">
                      {SPECIALTY_OPTIONS.find((option) => option.value === user.specialty)?.label ?? "—"}
                    </td>
                    <td className="max-w-[9rem] px-3 py-2.5 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                      {(user.zones ?? []).length > 0 ? (user.zones ?? []).map((zone) => zone.name).join("، ") : "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-800 dark:text-slate-200">
                      {ROLE_OPTIONS.find((option) => option.value === user.role)?.label ?? user.role}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-700 dark:text-slate-300">{user.account_status}</td>
                    {TABLE_QUICK_PERMS.map((col) => {
                      const on = eff[col.key];
                      const saving = permRowSaving === `${user.id}-${col.key}`;
                      return (
                        <td key={col.key} className="px-1 py-2 text-center align-middle">
                          <TablePermSwitch
                            checked={on}
                            disabled={isAdminRow}
                            saving={saving}
                            ariaLabel={`${col.header} — ${user.full_name}`}
                            onToggle={() => void saveTablePermission(user, col.key, !on)}
                          />
                        </td>
                      );
                    })}
                    <td className="px-3 py-2">
                      <div className="flex flex-col items-stretch gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
                        <select
                          className="h-9 min-w-[7.5rem] rounded-md border border-slate-200 bg-white px-2 text-xs dark:border-slate-600 dark:bg-slate-900"
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
                          type="button"
                          className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:hover:bg-slate-800"
                          onClick={() => void saveRole(user)}
                          disabled={savingUserId === user.id || (draftRoleMap[user.id] ?? user.role) === user.role}
                        >
                          {savingUserId === user.id ? "…" : "حفظ"}
                        </button>
                        <button
                          type="button"
                          className="rounded-md border border-emerald-200 bg-emerald-50/80 px-2 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200"
                          onClick={() => openPasswordModal(user)}
                        >
                          كلمة المرور
                        </button>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700"
                        onClick={() => openEditUser(user)}
                      >
                        تعديل
                      </button>
                    </td>
                    <td className="px-2 py-2 text-center">
                      <button
                        type="button"
                        title="حذف المستخدم"
                        disabled={user.id === currentUserId || quickDeleteId === user.id}
                        onClick={() => void quickDeleteUser(user)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-600 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400 dark:hover:bg-red-950/70"
                      >
                        {quickDeleteId === user.id ? (
                          <span className="text-xs">…</span>
                        ) : (
                          <Trash2 className="h-4 w-4" strokeWidth={2.25} />
                        )}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {users.length === 0 ? (
                <tr>
                  <td colSpan={14} className="px-3 py-10 text-center text-slate-500">
                    لا يوجد مستخدمون حالياً.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {usersTotal > USERS_TABLE_PAGE_SIZE ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900/40">
            <p className="text-slate-600 dark:text-slate-400">
              عرض {(usersTablePage - 1) * USERS_TABLE_PAGE_SIZE + 1}–
              {Math.min(usersTablePage * USERS_TABLE_PAGE_SIZE, usersTotal)} من {usersTotal}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium disabled:opacity-40 dark:border-slate-600 dark:bg-slate-900"
                disabled={usersTablePage <= 1}
                onClick={() => setUsersTablePage((p) => Math.max(1, p - 1))}
              >
                السابق
              </button>
              <span className="text-xs text-slate-500">
                صفحة {usersTablePage} / {usersTotalPages}
              </span>
              <button
                type="button"
                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium disabled:opacity-40 dark:border-slate-600 dark:bg-slate-900"
                disabled={usersTablePage >= usersTotalPages}
                onClick={() => setUsersTablePage((p) => Math.min(usersTotalPages, p + 1))}
              >
                التالي
              </button>
            </div>
          </div>
        ) : null}
        </>
      )}

      {isInviteModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={closeInviteModal}>
          <div
            className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-4">
              <h3 className="text-lg font-semibold text-slate-900">إضافة مستخدم جديد</h3>
              <button
                className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                onClick={closeInviteModal}
              >
                X
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
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
                <p className="mb-2 text-sm font-medium">اسم المستخدم (بالإنجليزية)</p>
                <Input
                  dir="ltr"
                  className="text-left"
                  value={inviteUsername}
                  onChange={(e) => {
                    setInviteUsername(e.target.value);
                    setInviteErrors((prev) => ({ ...prev, username: undefined }));
                  }}
                  placeholder="مثال: ahmed.khalid"
                  autoComplete="username"
                />
                <p className="mt-1 text-[11px] text-slate-500">يُخزَّن داخلياً كنطاق نظامي — لا حاجة لإدخال بريد.</p>
                {inviteErrors.username ? <p className="mt-1 text-xs text-red-600">{inviteErrors.username}</p> : null}
              </div>

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
                    {isFetching && zones.length === 0 ? <p className="p-2 text-xs text-slate-500">جاري تحميل المناطق...</p> : null}
                    {!isFetching && zones.length === 0 ? <p className="p-2 text-xs text-slate-500">لا توجد مناطق متاحة.</p> : null}
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

              <div className="md:col-span-2 space-y-2 rounded-lg border border-slate-200 bg-slate-50/80 p-3">
                <p className="text-sm font-semibold text-slate-900">صلاحيات الواجهة عند الإنشاء</p>
                {inviteRole === "admin" ? (
                  <p className="text-xs text-slate-600">مدير النظام يملك جميع الصلاحيات تلقائياً.</p>
                ) : (
                  APP_PERMISSION_KEYS.map((key) => (
                    <PermToggle
                      key={key}
                      label={PERM_LABELS_AR[key]}
                      checked={Boolean(invitePermToggles[key])}
                      onChange={(v) =>
                        setInvitePermToggles((prev) => ({
                          ...prev,
                          [key]: v,
                        }))
                      }
                    />
                  ))
                )}
              </div>
            </div>
            </div>

            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
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
                {inviting ? "جاري المعالجة..." : "إنشاء الحساب وتفعيله"}
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
            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <p className="mb-1 text-sm font-medium">اسم المستخدم (بالإنجليزية)</p>
                <Input
                  dir="ltr"
                  className="text-left"
                  value={editUsername}
                  onChange={(e) => setEditUsername(e.target.value)}
                  autoComplete="username"
                />
                <p className="mt-1 text-[11px] text-slate-500">يُخزَّن داخلياً كنطاق نظامي؛ لا حاجة لإدخال بريد.</p>
              </div>
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

