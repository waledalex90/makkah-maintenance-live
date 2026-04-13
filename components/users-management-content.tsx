"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import {
  APP_PERMISSION_KEYS,
  defaultInvitePermissionToggles,
  effectivePermissions,
  type AppPermissionKey,
} from "@/lib/permissions";
import { displayLoginIdentifier, parseUsernameOrEmailLocalPart } from "@/lib/username-auth";
import {
  isProtectedSuperAdminEmail,
  shouldHideAdminActionsForProtectedRow,
} from "@/lib/protected-super-admin";

const PERM_LABELS_AR: Record<AppPermissionKey, string> = {
  view_dashboard: "لوحة التحكم",
  view_tickets: "البلاغات والمهام",
  view_map: "الخريطة التفاعلية",
  view_reports: "التقارير والمؤشرات",
  manage_zones: "إدارة المناطق",
  manage_users: "إدارة المستخدمين",
  view_settings: "الإعدادات",
};

/** مناطق مختصرة + تلميح بالقائمة الكاملة عند التمرير */
function RegionsCell({ zones }: { zones: Array<{ id: string; name: string }> | undefined }) {
  const list = zones ?? [];
  if (list.length === 0) {
    return <span className="text-slate-400">—</span>;
  }
  const fullLabel = list.map((z) => z.name).join("، ");
  if (list.length <= 2) {
    return (
      <span className="block max-w-[10rem] cursor-default truncate text-xs text-slate-600 dark:text-slate-400" title={fullLabel}>
        {fullLabel}
      </span>
    );
  }
  const firstTwo = list
    .slice(0, 2)
    .map((z) => z.name)
    .join("، ");
  const rest = list.length - 2;
  return (
    <span
      className="block max-w-[10rem] cursor-help text-xs leading-snug text-slate-600 dark:text-slate-400"
      title={fullLabel}
    >
      <span className="line-clamp-2 break-words">{firstTwo}</span>
      <span className="mt-0.5 block whitespace-nowrap text-[11px] font-medium text-slate-500 dark:text-slate-500">
        +{rest} أخرى
      </span>
    </span>
  );
}

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
        "relative mx-auto block h-6 w-10 shrink-0 rounded-full transition-colors focus-visible:outline focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1",
        checked
          ? "bg-emerald-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]"
          : "bg-slate-300 dark:bg-slate-600",
        (disabled || saving) && "cursor-not-allowed opacity-60",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all",
          checked ? "start-[1.125rem]" : "start-0.5",
        )}
      />
    </button>
  );
}

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
  | "reporter"
  | "data_entry";

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
  /** واجهة مهام الميدان */
  access_work_list?: boolean;
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
  { value: "reporter", label: "مبلّغ بلاغ" },
  { value: "data_entry", label: "إدخال بيانات (عمليات)" },
  { value: "engineer", label: "مهندس" },
  { value: "supervisor", label: "مشرف" },
  { value: "technician", label: "فني" },
];

const ROLE_TEMPLATE_STORAGE_KEY = "makkah-role-permission-templates-v1";

const PERMISSION_GROUPS: Array<{
  id: string;
  label: string;
  keys: AppPermissionKey[];
}> = [
  { id: "tickets", label: "صلاحيات البلاغات", keys: ["view_dashboard", "view_tickets", "view_map"] },
  { id: "reports", label: "صلاحيات التقارير", keys: ["view_reports", "view_settings"] },
  { id: "users", label: "صلاحيات المستخدمين", keys: ["manage_users", "manage_zones"] },
];

type RolePermissionTemplate = {
  id: string;
  name: string;
  role: UserRole;
  permissions: Record<AppPermissionKey, boolean>;
  isSystem: boolean;
};

function makeDefaultRoleTemplates(): RolePermissionTemplate[] {
  return ROLE_OPTIONS.map((role) => ({
    id: `sys-${role.value}`,
    name: role.label,
    role: role.value,
    permissions: effectivePermissions(role.value, null),
    isSystem: true,
  }));
}

/** فني، مهندس، مشرف — أدوار تحتاج حقل التصنيف */
const ROLES_WITH_SPECIALTY = new Set<UserRole>(["technician", "engineer", "supervisor"]);

function showSpecialtyForRole(role: UserRole): boolean {
  return ROLES_WITH_SPECIALTY.has(role);
}

const SPECIALTY_OPTIONS: Array<{ value: Specialty; label: string }> = [
  { value: "fire", label: "حريق" },
  { value: "electricity", label: "كهرباء" },
  { value: "ac", label: "تكييف" },
  { value: "civil", label: "مدني" },
  { value: "kitchens", label: "مطابخ" },
];

type UsersManagementContentProps = {
  initialView?: "users" | "roles";
};

export function UsersManagementContent({ initialView = "users" }: UsersManagementContentProps) {
  const queryClient = useQueryClient();
  const [activeView, setActiveView] = useState<"users" | "roles">(initialView);
  const [roleTemplates, setRoleTemplates] = useState<RolePermissionTemplate[]>(makeDefaultRoleTemplates);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateRole, setNewTemplateRole] = useState<UserRole>("supervisor");
  const [inviteTemplateId, setInviteTemplateId] = useState<string>("");
  const [editTemplateId, setEditTemplateId] = useState<string>("");
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
    defaultInvitePermissionToggles(),
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
  const [accessListSavingId, setAccessListSavingId] = useState<string | null>(null);
  const [quickDeleteId, setQuickDeleteId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [nameSearch, setNameSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [roleEditorTemplateId, setRoleEditorTemplateId] = useState<string | null>(null);
  const selectAllCheckboxRef = useRef<HTMLInputElement>(null);

  const fetchAllAdminUsers = useCallback(async () => {
    const res = await fetch("/api/admin/users", { cache: "no-store" });
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
    queryKey: ["admin-users-all"],
    queryFn: fetchAllAdminUsers,
    placeholderData: (prev) => prev,
    staleTime: 60_000,
  });

  const users = usersQueryData?.users ?? [];
  const zones = usersQueryData?.zones ?? [];

  const filteredUsers = useMemo(() => {
    const q = nameSearch.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const name = u.full_name.toLowerCase();
      const un = (u.username ?? "").toLowerCase();
      const mob = (u.mobile ?? "").replace(/\s/g, "");
      return name.includes(q) || un.includes(q) || mob.includes(q);
    });
  }, [users, nameSearch]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(ROLE_TEMPLATE_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as RolePermissionTemplate[];
      if (!Array.isArray(parsed) || parsed.length === 0) return;
      const system = makeDefaultRoleTemplates();
      const mergedSystem = system.map((s) => {
        const found = parsed.find((p) => p.id === s.id);
        return found ? { ...s, permissions: found.permissions } : s;
      });
      const custom = parsed.filter((p) => !p.isSystem);
      setRoleTemplates([...mergedSystem, ...custom]);
    } catch {
      setRoleTemplates(makeDefaultRoleTemplates());
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(ROLE_TEMPLATE_STORAGE_KEY, JSON.stringify(roleTemplates));
  }, [roleTemplates]);
  useEffect(() => {
    setActiveView(initialView);
  }, [initialView]);

  const roleTemplateMap = useMemo(() => new Map(roleTemplates.map((t) => [t.id, t])), [roleTemplates]);
  const roleEditorTemplate = roleEditorTemplateId ? roleTemplateMap.get(roleEditorTemplateId) ?? null : null;

  const isSuperAdminViewer = isProtectedSuperAdminEmail(currentUserEmail);

  const selectableFilteredUsers = useMemo(
    () =>
      filteredUsers.filter((u) => !isProtectedSuperAdminEmail(u.email) && u.id !== currentUserId),
    [filteredUsers, currentUserId],
  );

  const { allSelectableSelected, someSelectableSelected } = useMemo(() => {
    if (selectableFilteredUsers.length === 0) {
      return { allSelectableSelected: false, someSelectableSelected: false };
    }
    let n = 0;
    for (const u of selectableFilteredUsers) {
      if (selectedIds.has(u.id)) n += 1;
    }
    return {
      allSelectableSelected: n === selectableFilteredUsers.length,
      someSelectableSelected: n > 0 && n < selectableFilteredUsers.length,
    };
  }, [selectableFilteredUsers, selectedIds]);

  useEffect(() => {
    const el = selectAllCheckboxRef.current;
    if (!el) return;
    el.indeterminate = someSelectableSelected;
  }, [someSelectableSelected, allSelectableSelected]);

  useEffect(() => {
    if (usersQueryError) {
      toast.error(usersQueryError.message);
    }
  }, [usersQueryError]);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id ?? null);
      setCurrentUserEmail(data.user?.email?.trim().toLowerCase() ?? null);
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
    await queryClient.invalidateQueries({ queryKey: ["admin-users-all"] });
  }, [queryClient]);

  const createRoleTemplate = () => {
    const name = newTemplateName.trim();
    if (!name) {
      toast.error("اسم الدور التشغيلي مطلوب.");
      return;
    }
    const next: RolePermissionTemplate = {
      id: `custom-${Date.now()}`,
      name,
      role: newTemplateRole,
      permissions: effectivePermissions(newTemplateRole, null),
      isSystem: false,
    };
    setRoleTemplates((prev) => [next, ...prev]);
    setNewTemplateName("");
    toast.success("تم إنشاء دور تشغيلي جديد.");
  };

  const updateTemplatePermission = (templateId: string, key: AppPermissionKey, value: boolean) => {
    setRoleTemplates((prev) =>
      prev.map((t) => (t.id === templateId ? { ...t, permissions: { ...t.permissions, [key]: value } } : t)),
    );
  };

  const deleteTemplate = (templateId: string) => {
    const row = roleTemplateMap.get(templateId);
    if (!row || row.isSystem) return;
    setRoleTemplates((prev) => prev.filter((t) => t.id !== templateId));
  };

  const saveAccessWorkList = async (user: UserRow, next: boolean) => {
    if (shouldHideAdminActionsForProtectedRow(user.email, currentUserEmail)) {
      toast.error("لا يمكن تعديل حساب المدير المحمي إلا من صاحبه.");
      return;
    }
    setAccessListSavingId(user.id);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_work_list: next }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? "فشل تحديث واجهة الفريق.");
        return;
      }
      toast.success(next ? "تم تفعيل واجهة مهام الميدان." : "تم إيقاف واجهة مهام الميدان.");
      await invalidateUsers();
    } finally {
      setAccessListSavingId(null);
    }
  };

  const saveRole = async (user: UserRow) => {
    if (shouldHideAdminActionsForProtectedRow(user.email, currentUserEmail)) {
      toast.error("لا يمكن تعديل حساب المدير المحمي إلا من صاحبه.");
      return;
    }
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
    if (shouldHideAdminActionsForProtectedRow(user.email, currentUserEmail)) {
      toast.error("لا يمكن تعديل حساب المدير المحمي إلا من صاحبه.");
      return;
    }
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
    if (isProtectedSuperAdminEmail(user.email)) {
      toast.error("لا يمكن حذف حساب المدير المحمي.");
      return;
    }
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
    setInviteTemplateId("");
    setInviteErrors({});
    setInvitePassword("");
    setInvitePermToggles(defaultInvitePermissionToggles());
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
      specialty: showSpecialtyForRole(inviteRole) ? inviteSpecialty : "civil",
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
    if (!inviteTemplateId) {
      setInvitePermToggles(effectivePermissions(inviteRole, null));
      return;
    }
    const template = roleTemplateMap.get(inviteTemplateId);
    if (!template) return;
    setInviteRole(template.role);
    setInvitePermToggles(template.permissions);
  }, [inviteTemplateId, inviteRole, isInviteModalOpen, roleTemplateMap]);

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
    const defaultTemplateId = "sys-technician";
    setInviteTemplateId(defaultTemplateId);
    setInviteRole("technician");
    setInvitePermToggles(roleTemplateMap.get(defaultTemplateId)?.permissions ?? effectivePermissions("technician", null));
    if (zones.length > 0) return;
    await refetch();
  };

  const openPasswordModal = (user: UserRow) => {
    if (shouldHideAdminActionsForProtectedRow(user.email, currentUserEmail)) {
      toast.error("لا يمكن تعديل حساب المدير المحمي إلا من صاحبه.");
      return;
    }
    setPasswordModalUser(user);
    setNewPassword("");
    setPasswordError(null);
  };

  const openEditUser = (user: UserRow) => {
    if (shouldHideAdminActionsForProtectedRow(user.email, currentUserEmail)) {
      toast.error("لا يمكن تعديل حساب المدير المحمي إلا من صاحبه.");
      return;
    }
    setEditingUser(user);
    setEditUsername(
      displayLoginIdentifier(user.email && user.email !== "غير متوفر" ? user.email : null, user.username),
    );
    setEditName(user.full_name);
    setEditRole(user.role);
    setEditTemplateId(`sys-${user.role}`);
    setEditRegion(user.region ?? "");
    setEditSpecialty((user.specialty as Specialty) ?? "civil");
    setEditZoneIds((user.zones ?? []).map((z) => z.id));
    setPermToggles(effectivePermissions(user.role, user.permissions ?? undefined));
    setEditZoneDropdownOpen(false);
    setDeleteConfirm(false);
  };

  const closeEditUser = () => {
    setEditingUser(null);
    setEditTemplateId("");
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
      specialty: showSpecialtyForRole(editRole) ? editSpecialty : "civil",
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
    if (isProtectedSuperAdminEmail(editingUser.email)) {
      toast.error("لا يمكن حذف حساب المدير المحمي.");
      return;
    }
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

  const rowSelectable = (user: UserRow) =>
    !isProtectedSuperAdminEmail(user.email) && user.id !== currentUserId;

  const toggleUserSelected = (user: UserRow) => {
    if (!rowSelectable(user)) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(user.id)) next.delete(user.id);
      else next.add(user.id);
      return next;
    });
  };

  const toggleSelectAllFiltered = () => {
    setSelectedIds((prev) => {
      if (selectableFilteredUsers.length === 0) return new Set(prev);
      const allOn = selectableFilteredUsers.every((u) => prev.has(u.id));
      const next = new Set(prev);
      if (allOn) {
        for (const u of selectableFilteredUsers) next.delete(u.id);
      } else {
        for (const u of selectableFilteredUsers) next.add(u.id);
      }
      return next;
    });
  };

  const runBulkDelete = async () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    setBulkDeleting(true);
    try {
      const res = await fetch("/api/admin/users/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        deleted_count?: number;
        skipped?: Array<{ id: string; reason: string }>;
        error?: string;
      };
      if (!res.ok) {
        toast.error(data.error ?? "فشل الحذف الجماعي.");
        return;
      }
      const skipped = data.skipped ?? [];
      toast.success(`تم حذف ${data.deleted_count ?? 0} مستخدم${skipped.length ? ` (تخطي ${skipped.length})` : ""}.`);
      setBulkDeleteOpen(false);
      setSelectedIds(new Set());
      await invalidateUsers();
    } finally {
      setBulkDeleting(false);
    }
  };

  return (
    <section className="w-full min-w-0 max-w-full rounded-xl border border-slate-200 bg-slate-100 p-4 shadow-sm" dir="rtl" lang="ar">
      <div className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-slate-900">إدارة الفرق الميدانية</h1>
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
          {isSuperAdminViewer && selectedIds.size > 0 ? (
            <button
              type="button"
              className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-800 shadow-sm transition hover:bg-red-100 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200"
              onClick={() => setBulkDeleteOpen(true)}
            >
              حذف المحددين ({selectedIds.size})
            </button>
          ) : null}
          <button
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
            onClick={() => void openInviteModal()}
          >
            إنشاء مستخدم
          </button>
        </div>
        </div>
        <div className="mt-3 inline-flex rounded-xl border border-slate-200 bg-white p-1">
          <button
            type="button"
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-semibold transition duration-300 ease-in-out",
              activeView === "users" ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100",
            )}
            onClick={() => setActiveView("users")}
          >
            إدارة الفرق الميدانية
          </button>
          <button
            type="button"
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-semibold transition duration-300 ease-in-out",
              activeView === "roles" ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100",
            )}
            onClick={() => setActiveView("roles")}
          >
            الأدوار والصلاحيات
          </button>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
          نموذج الرفع يتضمّن عمود <span className="font-mono">access_work_list</span> (1 = تفعيل واجهة مهام الميدان، 0 = إيقافها). ورقة Excel
          «إرشادات_access_work_list» وملف CSV يبدأ بتعليق يشرح العمود؛ إن تُرك فارغاً يُفعَّل تلقائياً لفني/مهندس/مشرف/إدخال بيانات فقط.
        </p>
      </div>

      {activeView === "users" ? (
      <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50/80 p-3">
        <label className="mb-2 block text-sm font-semibold text-slate-800 dark:text-slate-100">بحث بالاسم</label>
        <Input
          className="h-10 max-w-md text-sm"
          value={nameSearch}
          onChange={(e) => setNameSearch(e.target.value)}
          placeholder="اكتب جزءاً من الاسم أو اسم المستخدم أو الجوال — يُصفّى الجدول فوراً"
        />
        <p className="mt-1.5 text-xs text-slate-500">
          {filteredUsers.length} مستخدم معروض من أصل {users.length}
        </p>
      </div>
      ) : null}

      {activeView === "roles" ? (
      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-900">استوديو الأدوار والصلاحيات</h2>
            <p className="text-xs text-slate-500">عرّف أدواراً تشغيلية واضبط الصلاحيات حسب مجموعات العمل.</p>
          </div>
        </div>
        <div className="mb-4 grid gap-2 md:grid-cols-[1fr_auto_auto]">
          <Input
            value={newTemplateName}
            onChange={(e) => setNewTemplateName(e.target.value)}
            placeholder="اسم الدور التشغيلي (مثال: مشرف حج)"
          />
          <select
            className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
            value={newTemplateRole}
            onChange={(e) => setNewTemplateRole(e.target.value as UserRole)}
          >
            {ROLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="inline-flex h-10 items-center justify-center gap-1 rounded-md bg-emerald-700 px-3 text-sm font-semibold text-white hover:bg-emerald-800"
            onClick={createRoleTemplate}
          >
            <Plus className="h-4 w-4" />
            إنشاء دور
          </button>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          {roleTemplates.map((template) => (
            <div key={template.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{template.name}</p>
                  <p className="text-[11px] text-slate-500">
                    دور النظام: {ROLE_OPTIONS.find((r) => r.value === template.role)?.label ?? template.role}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    className="rounded border border-emerald-200 bg-white px-2 py-1 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50"
                    onClick={() => setRoleEditorTemplateId(template.id)}
                  >
                    تعديل
                  </button>
                  {!template.isSystem ? (
                    <button
                      type="button"
                      className="rounded border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                      onClick={() => deleteTemplate(template.id)}
                    >
                      حذف
                    </button>
                  ) : (
                    <span className="rounded border border-slate-200 px-2 py-1 text-[10px] text-slate-500">افتراضي</span>
                  )}
                </div>
              </div>
              <p className="text-xs text-slate-500">استخدم "تعديل" لفتح لوحة جانبية وتحديث صلاحيات هذا الدور فورًا.</p>
            </div>
          ))}
        </div>
      </div>
      ) : null}

      {activeView === "users" && (isLoading && !usersQueryData ? (
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
        <div className="w-full max-w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 max-h-[min(72vh,calc(100vh-13rem))]">
          <table className="min-w-[1140px] w-full table-fixed border-collapse text-right text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-800 dark:border-slate-700 dark:text-slate-100">
                <th className="sticky right-0 top-0 z-[23] w-9 min-w-[2.25rem] max-w-[2.25rem] bg-slate-100 px-1 py-2 text-center align-middle shadow-[4px_0_8px_-4px_rgba(0,0,0,0.08)] dark:bg-slate-900">
                  <input
                    ref={selectAllCheckboxRef}
                    type="checkbox"
                    className="h-4 w-4 cursor-pointer accent-sky-600"
                    disabled={selectableFilteredUsers.length === 0}
                    checked={allSelectableSelected}
                    onChange={() => toggleSelectAllFiltered()}
                    title="تحديد الكل في القائمة المعروضة"
                    aria-label="تحديد كل المستخدمين المعروضين"
                  />
                </th>
                <th className="sticky right-9 top-0 z-[21] min-w-[7.5rem] max-w-[9rem] bg-slate-100 px-2 py-2 text-xs font-semibold shadow-[4px_0_8px_-4px_rgba(0,0,0,0.08)] dark:bg-slate-900 dark:shadow-[4px_0_8px_-4px_rgba(0,0,0,0.25)]">
                  الاسم
                </th>
                <th className="sticky top-0 z-20 min-w-[6.5rem] max-w-[7rem] bg-slate-100 px-2 py-2 text-xs font-semibold dark:bg-slate-900">
                  المستخدم
                </th>
                <th className="sticky top-0 z-20 w-[6.5rem] min-w-[6rem] bg-slate-100 px-2 py-2 text-xs font-semibold dark:bg-slate-900">
                  الجوال
                </th>
                <th className="sticky top-0 z-20 min-w-[6rem] max-w-[7rem] bg-slate-100 px-2 py-2 text-xs font-semibold dark:bg-slate-900">
                  المهنة
                </th>
                <th className="sticky top-0 z-20 w-[4.5rem] min-w-[4rem] bg-slate-100 px-2 py-2 text-xs font-semibold dark:bg-slate-900">
                  التصنيف
                </th>
                <th className="sticky top-0 z-20 min-w-[7rem] max-w-[8.5rem] bg-slate-100 px-2 py-2 text-xs font-semibold dark:bg-slate-900">
                  المناطق
                </th>
                <th className="sticky top-0 z-20 min-w-[5.5rem] bg-slate-100 px-2 py-2 text-xs font-semibold dark:bg-slate-900">
                  الدور
                </th>
                <th className="sticky top-0 z-20 w-[4rem] bg-slate-100 px-2 py-2 text-xs font-semibold dark:bg-slate-900">
                  الحالة
                </th>
                <th className="sticky top-0 z-20 w-[4.5rem] min-w-[4.25rem] bg-slate-100 px-1 py-2 text-center text-[11px] font-semibold leading-tight text-slate-700 dark:bg-slate-900 dark:text-slate-200">
                  واجهة الفريق
                </th>
                {TABLE_QUICK_PERMS.map((col) => (
                  <th
                    key={col.key}
                    className="sticky top-0 z-20 w-[4.25rem] min-w-[4.25rem] bg-slate-100 px-1 py-2 text-center text-[11px] font-semibold leading-tight text-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  >
                    {col.header}
                  </th>
                ))}
                <th className="sticky top-0 z-20 min-w-[14rem] bg-slate-100 px-2 py-2 text-xs font-semibold dark:bg-slate-900">
                  إجراءات
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user, rowIdx) => {
                const eff = effectivePermissions(user.role, user.permissions ?? undefined);
                const isAdminRow = user.role === "admin";
                const hideActionsForOthers = shouldHideAdminActionsForProtectedRow(user.email, currentUserEmail);
                const rowQuickLock = isAdminRow || hideActionsForOthers;
                const zebraEven = rowIdx % 2 === 0;
                const rowBg = zebraEven ? "bg-white dark:bg-slate-950" : "bg-slate-50/80 dark:bg-slate-900/40";
                const jobTitle = user.job_title || "—";
                const canSelectRow = rowSelectable(user);
                return (
                  <tr
                    key={user.id}
                    className={cn(
                      "h-14 max-h-14 border-b border-slate-100 align-middle transition-colors dark:border-slate-800",
                      rowBg,
                    )}
                  >
                    <td
                      className={cn(
                        "sticky right-0 z-[12] w-9 min-w-[2.25rem] px-1 py-1.5 text-center align-middle shadow-[4px_0_8px_-4px_rgba(0,0,0,0.06)]",
                        rowBg,
                      )}
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 cursor-pointer accent-sky-600 disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={!canSelectRow}
                        checked={selectedIds.has(user.id)}
                        onChange={() => toggleUserSelected(user)}
                        aria-label={`تحديد ${user.full_name}`}
                      />
                    </td>
                    <td
                      className={cn(
                        "sticky right-9 z-[11] max-w-[9rem] px-2 py-1.5 align-middle font-medium shadow-[4px_0_8px_-4px_rgba(0,0,0,0.06)] dark:text-slate-50",
                        rowBg,
                      )}
                    >
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className="min-w-0 flex-1 truncate text-slate-900" title={user.full_name}>
                          {user.full_name}
                        </span>
                        {isProtectedSuperAdminEmail(user.email) ? (
                          <span
                            className="inline-flex shrink-0 items-center rounded border border-amber-300/80 bg-amber-50 px-1 py-px text-[9px] font-semibold leading-none text-amber-900 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-200"
                            title="حساب مدير محمي"
                          >
                            محمي
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td
                      className="max-w-[7rem] truncate px-2 py-1.5 align-middle text-xs text-slate-700 dark:text-slate-300"
                      title={user.username || user.email}
                    >
                      {user.username || user.email}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 align-middle text-xs text-slate-700 dark:text-slate-300">
                      {user.mobile}
                    </td>
                    <td
                      className="max-w-[7rem] truncate px-2 py-1.5 align-middle text-xs text-slate-700 dark:text-slate-300"
                      title={jobTitle}
                    >
                      {jobTitle}
                    </td>
                    <td className="truncate px-2 py-1.5 align-middle text-xs text-slate-700 dark:text-slate-300">
                      {SPECIALTY_OPTIONS.find((option) => option.value === user.specialty)?.label ?? "—"}
                    </td>
                    <td className="max-h-14 min-w-0 overflow-hidden px-2 py-1 align-middle">
                      <RegionsCell zones={user.zones} />
                    </td>
                    <td className="truncate px-2 py-1.5 align-middle text-xs text-slate-800 dark:text-slate-200" title={ROLE_OPTIONS.find((o) => o.value === user.role)?.label}>
                      {ROLE_OPTIONS.find((option) => option.value === user.role)?.label ?? user.role}
                    </td>
                    <td className="truncate px-2 py-1.5 align-middle text-xs text-slate-700 dark:text-slate-300">
                      {user.account_status}
                    </td>
                    <td className="px-0.5 py-1 text-center align-middle">
                      <TablePermSwitch
                        checked={Boolean(user.access_work_list)}
                        disabled={hideActionsForOthers}
                        saving={accessListSavingId === user.id}
                        ariaLabel={`واجهة الفريق — ${user.full_name}`}
                        onToggle={() => void saveAccessWorkList(user, !user.access_work_list)}
                      />
                    </td>
                    {TABLE_QUICK_PERMS.map((col) => {
                      const on = eff[col.key];
                      const saving = permRowSaving === `${user.id}-${col.key}`;
                      return (
                        <td key={col.key} className="px-0.5 py-1 text-center align-middle">
                          <TablePermSwitch
                            checked={on}
                            disabled={rowQuickLock}
                            saving={saving}
                            ariaLabel={`${col.header} — ${user.full_name}`}
                            onToggle={() => void saveTablePermission(user, col.key, !on)}
                          />
                        </td>
                      );
                    })}
                    <td className="min-w-[14rem] max-w-[18rem] px-1.5 py-1 align-middle">
                      <div className="flex flex-nowrap items-center justify-end gap-0.5 overflow-x-auto [scrollbar-width:thin]">
                        <select
                          className="h-7 min-w-[5.5rem] max-w-[6.5rem] flex-shrink rounded border border-slate-200 bg-white px-1 text-[11px] dark:border-slate-600 dark:bg-slate-900"
                          disabled={hideActionsForOthers}
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
                          className="h-7 shrink-0 rounded border border-slate-200 bg-white px-1.5 text-[11px] font-medium hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:hover:bg-slate-800"
                          onClick={() => void saveRole(user)}
                          disabled={
                            hideActionsForOthers ||
                            savingUserId === user.id ||
                            (draftRoleMap[user.id] ?? user.role) === user.role
                          }
                        >
                          {savingUserId === user.id ? "…" : "حفظ"}
                        </button>
                        <button
                          type="button"
                          className="h-7 shrink-0 whitespace-nowrap rounded border border-emerald-200 bg-emerald-50/90 px-1.5 text-[10px] font-medium leading-none text-emerald-900 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200"
                          onClick={() => openPasswordModal(user)}
                          disabled={hideActionsForOthers}
                        >
                          كلمة المرور
                        </button>
                        {hideActionsForOthers ? (
                          <span className="text-[11px] text-slate-400 dark:text-slate-500">—</span>
                        ) : (
                          <button
                            type="button"
                            className="h-7 shrink-0 rounded bg-indigo-600 px-2 text-[11px] font-semibold text-white shadow-sm hover:bg-indigo-700"
                            onClick={() => openEditUser(user)}
                          >
                            تعديل
                          </button>
                        )}
                        <button
                          type="button"
                          title="حذف المستخدم"
                          disabled={
                            isProtectedSuperAdminEmail(user.email) ||
                            user.id === currentUserId ||
                            quickDeleteId === user.id
                          }
                          onClick={() => void quickDeleteUser(user)}
                          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-red-200 bg-red-50 text-red-600 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400"
                        >
                          {quickDeleteId === user.id ? (
                            <span className="text-[10px]">…</span>
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" strokeWidth={2.25} />
                          )}
                        </button>
                      </div>
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
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={14} className="px-3 py-10 text-center text-slate-500">
                    لا توجد نتائج مطابقة للبحث.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        </>
      ))}

      {roleEditorTemplate ? (
        <div className="pointer-events-none fixed inset-0 z-50 flex">
          <button
            type="button"
            className="pointer-events-auto h-full w-full bg-black/30 transition-opacity duration-300 ease-in-out"
            aria-label="إغلاق محرر الدور"
            onClick={() => setRoleEditorTemplateId(null)}
          />
          <aside className="pointer-events-auto h-full w-[95%] max-w-xl overflow-y-auto border-l border-slate-200 bg-slate-50 p-4 shadow-2xl transition-transform duration-300 ease-in-out">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-900">تحرير الدور التشغيلي</h3>
                <p className="text-xs text-slate-500">{roleEditorTemplate.name}</p>
              </div>
              <button
                type="button"
                className="rounded-xl border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
                onClick={() => setRoleEditorTemplateId(null)}
              >
                إغلاق
              </button>
            </div>
            {PERMISSION_GROUPS.map((group) => (
              <div key={group.id} className="mb-2 rounded-xl border border-slate-200 bg-white p-3">
                <p className="mb-2 text-xs font-semibold text-slate-700">{group.label}</p>
                <div className="space-y-1.5">
                  {group.keys.map((key) => (
                    <PermToggle
                      key={`${roleEditorTemplate.id}-${key}`}
                      label={PERM_LABELS_AR[key]}
                      checked={Boolean(roleEditorTemplate.permissions[key])}
                      disabled={roleEditorTemplate.role === "admin"}
                      onChange={(v) => updateTemplatePermission(roleEditorTemplate.id, key, v)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </aside>
        </div>
      ) : null}

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
                <p className="mb-2 text-sm font-medium">قالب الدور التشغيلي</p>
                <select
                  className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                  value={inviteTemplateId}
                  onChange={(e) => setInviteTemplateId(e.target.value)}
                >
                  {roleTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <p className="mb-2 text-sm font-medium">الدور</p>
                <select
                  className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                  value={inviteRole}
                  onChange={(e) => {
                    const nextRole = e.target.value as UserRole;
                    const templateId = `sys-${nextRole}`;
                    setInviteRole(nextRole);
                    setInviteTemplateId(templateId);
                    setInvitePermToggles(
                      roleTemplateMap.get(templateId)?.permissions ?? effectivePermissions(nextRole, null),
                    );
                  }}
                >
                  {ROLE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              {showSpecialtyForRole(inviteRole) ? (
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
              ) : null}

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
                <p className="mb-1 text-sm font-medium">قالب الدور التشغيلي</p>
                <select
                  className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                  value={editTemplateId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setEditTemplateId(id);
                    const template = roleTemplateMap.get(id);
                    if (!template) return;
                    setEditRole(template.role);
                    setPermToggles(template.permissions);
                  }}
                >
                  {roleTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <p className="mb-1 text-sm font-medium">الرتبة</p>
                <select
                  className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                  value={editRole}
                  onChange={(e) => {
                    const nr = e.target.value as UserRole;
                    const templateId = `sys-${nr}`;
                    setEditRole(nr);
                    setEditTemplateId(templateId);
                    setPermToggles(roleTemplateMap.get(templateId)?.permissions ?? effectivePermissions(nr, null));
                  }}
                >
                  {ROLE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              {showSpecialtyForRole(editRole) ? (
                <div>
                  <p className="mb-1 text-sm font-medium">التصنيف</p>
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
              ) : null}
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
                {editingUser && isProtectedSuperAdminEmail(editingUser.email) ? (
                  <p className="text-xs font-medium text-amber-800 dark:text-amber-200/90">حساب مدير محمي — لا يُحذف من هنا.</p>
                ) : deleteConfirm ? (
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

      {bulkDeleteOpen ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4"
          onClick={() => (bulkDeleting ? undefined : setBulkDeleteOpen(false))}
        >
          <div
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-slate-900">تأكيد الحذف الجماعي</h3>
            <p className="mt-3 text-sm text-slate-600">
              هل أنت متأكد من حذف {selectedIds.size} مستخدمين نهائياً؟
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                disabled={bulkDeleting}
                onClick={() => setBulkDeleteOpen(false)}
              >
                إلغاء
              </button>
              <button
                type="button"
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                disabled={bulkDeleting}
                onClick={() => void runBulkDelete()}
              >
                {bulkDeleting ? "جاري الحذف…" : "تأكيد الحذف"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

