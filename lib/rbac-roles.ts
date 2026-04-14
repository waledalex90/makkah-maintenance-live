import { APP_PERMISSION_KEYS, type AppPermissionKey } from "@/lib/permissions";

export const LEGACY_SYSTEM_ROLE_KEYS = [
  "admin",
  "projects_director",
  "project_manager",
  "engineer",
  "supervisor",
  "technician",
  "reporter",
  "data_entry",
] as const;

export type LegacySystemRole = (typeof LEGACY_SYSTEM_ROLE_KEYS)[number];

export type RoleRow = {
  id: string;
  role_key: string;
  display_name: string;
  permissions: Record<string, unknown> | null;
  legacy_role: LegacySystemRole | null;
  is_system: boolean;
  company_id?: string | null;
};

export type PublicRoleOption = {
  id: string;
  role_key: string;
  display_name: string;
  permissions: Record<AppPermissionKey, boolean>;
  legacy_role: LegacySystemRole | null;
  is_system: boolean;
  company_id?: string | null;
  scope?: "global" | "tenant";
};

export function isLegacySystemRole(value: string | null | undefined): value is LegacySystemRole {
  return Boolean(value) && LEGACY_SYSTEM_ROLE_KEYS.includes(value as LegacySystemRole);
}

export function normalizeRoleKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_\s-]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function isValidRoleKey(roleKey: string): boolean {
  return /^[a-z0-9_]+$/.test(roleKey);
}

export function normalizeDisplayName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

export function sanitizePermissionPayload(
  raw: Record<string, unknown> | null | undefined,
): Record<AppPermissionKey, boolean> {
  const out = {} as Record<AppPermissionKey, boolean>;
  for (const key of APP_PERMISSION_KEYS) {
    out[key] = Boolean(raw?.[key]);
  }
  return out;
}

export function mergeRoleAndUserOverrides(
  rolePermissions: Record<string, unknown> | null | undefined,
  userOverrides: Record<string, unknown> | null | undefined,
): Record<AppPermissionKey, boolean> {
  const merged: Record<string, unknown> = { ...(rolePermissions ?? {}) };
  for (const key of APP_PERMISSION_KEYS) {
    if (userOverrides?.[key] === null) {
      delete merged[key];
      continue;
    }
    if (typeof userOverrides?.[key] === "boolean") {
      merged[key] = userOverrides[key];
    }
  }
  return sanitizePermissionPayload(merged);
}

export function roleToPublicOption(row: RoleRow): PublicRoleOption {
  return {
    id: row.id,
    role_key: row.role_key,
    display_name: row.display_name,
    permissions: sanitizePermissionPayload(row.permissions),
    legacy_role: row.legacy_role,
    is_system: row.is_system,
    company_id: row.company_id ?? null,
    scope: row.company_id ? "tenant" : "global",
  };
}

