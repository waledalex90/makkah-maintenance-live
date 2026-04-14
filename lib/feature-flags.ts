function isTruthy(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export function isDynamicRolesEnabled(): boolean {
  const raw = process.env.RBAC_DYNAMIC_ROLES_ENABLED;
  if (raw === undefined || raw === null || raw.trim() === "") {
    return true;
  }
  return isTruthy(raw);
}

