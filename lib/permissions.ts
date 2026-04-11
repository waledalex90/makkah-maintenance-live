/**
 * RBAC: صلاحيات الواجهة مخزّنة في profiles.permissions (JSONB).
 * المفتاح view_admin_reports مدعوم للتوافق مع البيانات القديمة ويُعامل مثل view_reports.
 */

export const APP_PERMISSION_KEYS = [
  "view_dashboard",
  "view_tickets",
  "view_map",
  "view_reports",
  "manage_zones",
  "manage_users",
  "view_settings",
] as const;

export type AppPermissionKey = (typeof APP_PERMISSION_KEYS)[number];

export type AppPermissions = Partial<Record<AppPermissionKey, boolean>>;

const ALL_TRUE: Record<AppPermissionKey, boolean> = {
  view_dashboard: true,
  view_tickets: true,
  view_map: true,
  view_reports: true,
  manage_zones: true,
  manage_users: true,
  view_settings: true,
};

function defaultsForRole(role: string): AppPermissions {
  switch (role) {
    case "admin":
      return { ...ALL_TRUE };
    case "project_manager":
    case "projects_director":
      return {
        view_dashboard: true,
        view_tickets: true,
        view_map: true,
        view_reports: true,
        manage_zones: true,
        manage_users: true,
        view_settings: true,
      };
    case "engineer":
      return {
        view_dashboard: true,
        view_tickets: true,
        view_map: true,
        view_reports: false,
        manage_zones: false,
        manage_users: false,
        view_settings: true,
      };
    case "reporter":
      return {
        view_dashboard: true,
        view_tickets: true,
        view_map: false,
        view_reports: false,
        manage_zones: false,
        manage_users: false,
        view_settings: true,
      };
    default:
      return {
        view_dashboard: true,
        view_tickets: true,
        view_map: true,
        view_reports: false,
        manage_zones: false,
        manage_users: false,
        view_settings: true,
      };
  }
}

/**
 * يدمج defaults حسب الرتبة مع JSON المخزّن. المدير يملك كل الصلاحيات دائماً.
 */
export function effectivePermissions(
  role: string | null | undefined,
  raw: Record<string, unknown> | null | undefined,
): Record<AppPermissionKey, boolean> {
  if (role === "admin") {
    return { ...ALL_TRUE };
  }

  const base = defaultsForRole(role ?? "engineer");
  const r = raw ?? {};

  const pick = (key: AppPermissionKey): boolean => {
    if (r[key] !== undefined) {
      return Boolean(r[key]);
    }
    if (key === "view_reports") {
      if (r.view_admin_reports !== undefined) {
        return Boolean(r.view_admin_reports);
      }
    }
    return Boolean(base[key]);
  };

  return {
    view_dashboard: pick("view_dashboard"),
    view_tickets: pick("view_tickets"),
    view_map: pick("view_map"),
    view_reports: pick("view_reports"),
    manage_zones: pick("manage_zones"),
    manage_users: pick("manage_users"),
    view_settings: pick("view_settings"),
  };
}

/** مسار Next.js → مفتاح الصلاحية المطلوب (تطابق الأكثر تحديداً أولاً). */
export function requiredPermissionForPath(pathname: string): AppPermissionKey | null {
  if (!pathname.startsWith("/dashboard")) return null;
  if (pathname.startsWith("/dashboard/map")) return "view_map";
  if (pathname.startsWith("/dashboard/reports")) return "view_reports";
  if (pathname.startsWith("/dashboard/admin/zones")) return "manage_zones";
  if (pathname.startsWith("/dashboard/admin/users")) return "manage_users";
  if (pathname.startsWith("/dashboard/tickets")) return "view_tickets";
  if (pathname.startsWith("/dashboard/tasks")) return "view_tickets";
  if (pathname.startsWith("/dashboard/settings")) return "view_settings";
  return "view_dashboard";
}

export function canAccessDashboardPath(
  pathname: string,
  role: string | null | undefined,
  raw: Record<string, unknown> | null | undefined,
): boolean {
  const key = requiredPermissionForPath(pathname);
  if (!key) return true;
  return effectivePermissions(role, raw)[key];
}
