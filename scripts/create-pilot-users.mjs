import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

function parseEnvFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const k = trimmed.slice(0, eq).trim();
    const v = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
    out[k] = v;
  }
  return out;
}

async function ensureCompany(supabase, slug, name) {
  const { data: existing, error: findError } = await supabase
    .from("companies")
    .select("id, name, slug")
    .eq("slug", slug)
    .maybeSingle();
  if (findError) throw new Error(findError.message);
  if (existing) return existing;
  const { data, error } = await supabase
    .from("companies")
    .insert({ slug, name, subscription_plan: "basic", status: "active" })
    .select("id, name, slug")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function ensureRole(supabase, companyId, roleKey, displayName) {
  const { data: existing, error: findError } = await supabase
    .from("roles")
    .select("id, role_key, company_id, legacy_role, permissions")
    .eq("company_id", companyId)
    .eq("role_key", roleKey)
    .maybeSingle();
  if (findError) throw new Error(findError.message);
  if (existing) return existing;
  const { data, error } = await supabase
    .from("roles")
    .insert({
      company_id: companyId,
      role_key: roleKey,
      display_name: displayName,
      permissions: {
        view_dashboard: true,
        view_tickets: true,
        view_map: false,
        view_reports: false,
        manage_zones: false,
        manage_users: false,
        view_settings: false,
      },
      legacy_role: "technician",
      is_system: false,
    })
    .select("id, role_key, company_id, legacy_role, permissions")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function findUserIdByEmail(supabase, email) {
  let page = 1;
  while (page <= 10) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const found = data.users.find((u) => (u.email || "").toLowerCase() === email.toLowerCase());
    if (found) return found.id;
    if (data.users.length < 200) break;
    page += 1;
  }
  return null;
}

async function ensureAuthUser(supabase, email, password) {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (!error && data.user?.id) return data.user.id;
  if (error && /already|registered|exists/i.test(error.message)) {
    const id = await findUserIdByEmail(supabase, email);
    if (id) {
      const { error: pwError } = await supabase.auth.admin.updateUserById(id, { password });
      if (pwError) throw new Error(pwError.message);
      return id;
    }
  }
  throw new Error(error?.message || "Failed creating auth user");
}

async function ensureProfileAndMembership(supabase, params) {
  const { userId, companyId, roleId, fullName, mobile, username } = params;
  const profilePayload = {
    id: userId,
    full_name: fullName,
    mobile,
    job_title: "Pilot User",
    specialty: "civil",
    role: "technician",
    role_id: roleId,
    permissions: {},
    username,
    access_work_list: true,
    company_id: companyId,
    active_company_id: companyId,
  };
  const { error: profileError } = await supabase.from("profiles").upsert(profilePayload, { onConflict: "id" });
  if (profileError) throw new Error(profileError.message);

  const { error: membershipError } = await supabase.from("company_memberships").upsert(
    {
      user_id: userId,
      company_id: companyId,
      role_id: roleId,
      status: "active",
      is_owner: false,
    },
    { onConflict: "user_id,company_id" },
  );
  if (membershipError) throw new Error(membershipError.message);
}

async function main() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) throw new Error(".env.local not found");
  const env = parseEnvFile(envPath);
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");

  const supabase = createClient(url, serviceRole, { auth: { autoRefreshToken: false, persistSession: false } });

  const companyA = await ensureCompany(supabase, "pilot-company-a", "Pilot Company A");
  const companyB = await ensureCompany(supabase, "pilot-company-b", "Pilot Company B");
  const roleA = await ensureRole(supabase, companyA.id, "pilot_operator", "Pilot Operator A");
  const roleB = await ensureRole(supabase, companyB.id, "pilot_operator", "Pilot Operator B");

  const creds = [
    {
      key: "A",
      email: "pilot.a@makkah-maintenance.test",
      password: "PilotA@2026!",
      username: "pilot.a",
      fullName: "Pilot User A",
      mobile: "0500000001",
      companyId: companyA.id,
      roleId: roleA.id,
    },
    {
      key: "B",
      email: "pilot.b@makkah-maintenance.test",
      password: "PilotB@2026!",
      username: "pilot.b",
      fullName: "Pilot User B",
      mobile: "0500000002",
      companyId: companyB.id,
      roleId: roleB.id,
    },
  ];

  for (const c of creds) {
    const userId = await ensureAuthUser(supabase, c.email, c.password);
    await ensureProfileAndMembership(supabase, {
      userId,
      companyId: c.companyId,
      roleId: c.roleId,
      fullName: c.fullName,
      mobile: c.mobile,
      username: c.username,
    });
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        users: creds.map((c) => ({ key: c.key, email: c.email, password: c.password })),
        companies: [
          { key: "A", id: companyA.id, slug: companyA.slug, name: companyA.name },
          { key: "B", id: companyB.id, slug: companyB.slug, name: companyB.name },
        ],
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});

