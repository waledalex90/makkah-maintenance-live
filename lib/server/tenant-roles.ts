import { normalizeRoleKey, type RoleRow } from "@/lib/rbac-roles";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

const ROLE_SELECT = "id, role_key, display_name, permissions, legacy_role, is_system, company_id";

export async function listVisibleRoles(
  admin: AdminClient,
  activeCompanyId: string | null,
): Promise<{ data: RoleRow[] | null; error: string | null }> {
  let query = admin.from("roles").select(ROLE_SELECT);
  if (activeCompanyId) {
    query = query.or(`company_id.is.null,company_id.eq.${activeCompanyId}`);
  } else {
    query = query.is("company_id", null);
  }
  const { data, error } = await query.order("is_system", { ascending: false }).order("display_name", { ascending: true });
  return {
    data: (data as RoleRow[] | null) ?? null,
    error: error?.message ?? null,
  };
}

export async function resolveRoleForTenant(
  admin: AdminClient,
  roleInput: string,
  activeCompanyId: string | null,
): Promise<{ role: RoleRow | null; error: string | null }> {
  const input = roleInput.trim();
  if (!input) return { role: null, error: null };

  const idMatch = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input);
  if (idMatch) {
    const { data, error } = await admin.from("roles").select(ROLE_SELECT).eq("id", input).maybeSingle();
    if (error) return { role: null, error: error.message };
    const role = (data as RoleRow | null) ?? null;
    if (!role) return { role: null, error: null };
    if (!role.company_id || role.company_id === activeCompanyId) {
      return { role, error: null };
    }
    return { role: null, error: null };
  }

  const normalized = normalizeRoleKey(input);
  if (!normalized) return { role: null, error: null };

  let query = admin.from("roles").select(ROLE_SELECT).eq("role_key", normalized);
  if (activeCompanyId) {
    query = query.or(`company_id.is.null,company_id.eq.${activeCompanyId}`);
  } else {
    query = query.is("company_id", null);
  }
  const { data, error } = await query;
  if (error) return { role: null, error: error.message };

  const rows = ((data as RoleRow[] | null) ?? []) as RoleRow[];
  if (rows.length === 0) return { role: null, error: null };
  const companyRole = activeCompanyId ? rows.find((row) => row.company_id === activeCompanyId) : undefined;
  return { role: companyRole ?? rows.find((row) => row.company_id === null) ?? rows[0] ?? null, error: null };
}

