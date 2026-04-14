import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireManageUsers } from "@/lib/auth-guards";
import { mergeExplicitInvitePermissions } from "@/lib/dashboard-user-permissions";
import { upsertProfileAndZones } from "@/lib/server/provision-dashboard-user";
import { parseUsernameOrEmailLocalPart, toAuthEmail } from "@/lib/username-auth";
import { APP_PERMISSION_KEYS, type AppPermissionKey } from "@/lib/permissions";
import { isProtectedSuperAdminEmail } from "@/lib/protected-super-admin";
import { defaultAccessWorkListForRole } from "@/lib/access-work-list-defaults";
import { mergeRoleAndUserOverrides, sanitizePermissionPayload, type RoleRow } from "@/lib/rbac-roles";
import { getTenantContext } from "@/lib/tenant-context";
import { listVisibleRoles } from "@/lib/server/tenant-roles";
import { assertWithinTechnicianLimit } from "@/lib/billing-limits";

function pickCell(row: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k] ?? row[k.toLowerCase()] ?? row[k.toUpperCase()];
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      return String(v).trim();
    }
  }
  return "";
}

function parseBool(v: string): boolean | undefined {
  const s = v.toLowerCase();
  if (s === "1" || s === "true" || s === "نعم" || s === "yes") return true;
  if (s === "0" || s === "false" || s === "لا" || s === "no") return false;
  return undefined;
}

function resolveAccessWorkList(raw: string, role: string): boolean {
  const t = raw.trim();
  if (t === "") {
    return defaultAccessWorkListForRole(role);
  }
  const b = parseBool(t);
  return b !== false;
}

/** يقبل slug إنجليزي أو تسمية عربية كما في واجهة الإدارة — يمنع الخلط بين «مبلّغ» و«إدخال بيانات». */
function parseBulkRole(cell: string): string | null {
  const t = cell.trim();
  if (!t) return "technician";
  const lower = t.toLowerCase();
  if (lower) return lower;
  const compact = t.replace(/\s+/g, " ").trim();
  const ar: Array<[string, string]> = [
    ["مدير النظام", "admin"],
    ["مدير المشاريع", "projects_director"],
    ["مدير مشروع", "project_manager"],
    ["مبلّغ بلاغ", "reporter"],
    ["مبلغ بلاغ", "reporter"],
    ["إدخال بيانات (عمليات)", "data_entry"],
    ["مهندس", "engineer"],
    ["مشرف", "supervisor"],
    ["فني", "technician"],
  ];
  for (const [label, r] of ar) {
    if (compact === label) return r;
  }
  return null;
}

export async function POST(request: Request) {
  const access = await requireManageUsers();
  if (!access.ok) {
    return NextResponse.json({ error: "غير مصرح" }, { status: access.status });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: "لم يُرفع ملف." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const fileName = (file as File).name?.toLowerCase() ?? "";
  let workbook: XLSX.WorkBook;
  try {
    if (fileName.endsWith(".csv")) {
      let text = buffer.toString("utf-8").replace(/^\uFEFF/, "");
      text = text
        .split(/\r?\n/)
        .filter((line) => !line.trim().startsWith("#"))
        .join("\n");
      workbook = XLSX.read(text, { type: "string" });
    } else {
      workbook = XLSX.read(buffer, { type: "buffer" });
    }
  } catch {
    return NextResponse.json({ error: "تعذر قراءة الملف (Excel أو CSV)." }, { status: 400 });
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return NextResponse.json({ error: "الملف فارغ." }, { status: 400 });
  }

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  if (rows.length === 0) {
    return NextResponse.json({ error: "لا توجد صفوف بيانات." }, { status: 400 });
  }

  const adminSupabase = createSupabaseAdminClient();
  const tenant = await getTenantContext();
  if (!tenant.ok) {
    return NextResponse.json({ error: tenant.error }, { status: tenant.status });
  }
  if (!tenant.activeCompanyId) {
    return NextResponse.json({ error: "missing_active_company" }, { status: 403 });
  }
  const activeCompanyId = tenant.activeCompanyId;
  const { data: zonesData } = await adminSupabase.from("zones").select("id, name, company_id");
  const tenantZones = (zonesData ?? []).filter((z) => (activeCompanyId ? z.company_id === activeCompanyId : true));
  const zoneByName = new Map(tenantZones.map((z) => [z.name.trim().toLowerCase(), z.id]));
  const { data: rolesData, error: rolesError } = await listVisibleRoles(adminSupabase, activeCompanyId);
  if (rolesError) {
    return NextResponse.json({ error: rolesError }, { status: 400 });
  }
  const roleByKey = new Map<string, RoleRow>();
  const roleByDisplayName = new Map<string, RoleRow>();
  ((rolesData as RoleRow[] | null) ?? []).forEach((r) => {
    const key = r.role_key.toLowerCase();
    const label = r.display_name.trim().toLowerCase();
    const existingByKey = roleByKey.get(key);
    const existingByLabel = roleByDisplayName.get(label);
    const preferCurrent = (candidate: RoleRow, current?: RoleRow) =>
      !current || (candidate.company_id === activeCompanyId && current.company_id !== activeCompanyId);
    if (preferCurrent(r, existingByKey)) roleByKey.set(key, r);
    if (preferCurrent(r, existingByLabel)) roleByDisplayName.set(label, r);
  });

  const created: string[] = [];
  const errors: Array<{ row: number; message: string }> = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const rowNum = i + 2;

    const usernameRaw = pickCell(
      row,
      "username",
      "اسم_المستخدم",
      "user",
      "اليوزر",
      "اليوزر_نيم",
      "اليوزرنيم",
    );
    const password = pickCell(row, "password", "كلمة_المرور", "الباسورد", "pass");
    const fullName = pickCell(row, "full_name", "full name", "الاسم", "الاسم_الكامل");
    const mobile = pickCell(row, "mobile", "phone", "الجوال", "الهاتف");
    const jobTitle = pickCell(row, "job_title", "job", "المهنة", "المسمى");
    const specialty = pickCell(row, "specialty", "التخصص", "تخصص") || "civil";
    const roleCell = pickCell(row, "role", "الدور");
    const roleStr = parseBulkRole(roleCell);
    const roleRow = roleStr ? roleByKey.get(roleStr.toLowerCase()) || roleByDisplayName.get(roleStr.toLowerCase()) : null;
    if (!roleRow) {
      errors.push({
        row: rowNum,
        message: `دور غير صالح: «${roleCell}». استخدم role_key أو display_name مطابقاً لأدوار النظام.`,
      });
      continue;
    }
    const zonesCell = pickCell(row, "zones", "المنطقة", "المناطق", "مناطق");
    const accessWorkListRaw = pickCell(row, "access_work_list", "access work list", "واجهة_الفريق", "واجهة الفريق");

    if (!usernameRaw || !password || !fullName || !mobile || !jobTitle || !zonesCell) {
      errors.push({ row: rowNum, message: "حقول مطلوبة ناقصة (username, password, full_name, mobile, job_title, zones)." });
      continue;
    }
    if (password.length < 8) {
      errors.push({ row: rowNum, message: "كلمة المرور أقل من 8 أحرف." });
      continue;
    }

    let usernameNormalized: string;
    try {
      usernameNormalized = parseUsernameOrEmailLocalPart(usernameRaw);
    } catch {
      errors.push({ row: rowNum, message: "اسم مستخدم غير صالح." });
      continue;
    }
    if (!usernameNormalized) {
      errors.push({ row: rowNum, message: "اسم مستخدم فارغ." });
      continue;
    }

    const zoneNames = zonesCell
      .split(/[,،;]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const zoneIds: string[] = [];
    let zoneBad = false;
    for (const zn of zoneNames) {
      const id = zoneByName.get(zn.toLowerCase());
      if (!id) {
        errors.push({ row: rowNum, message: `منطقة غير معروفة: ${zn}` });
        zoneBad = true;
        break;
      }
      zoneIds.push(id);
    }
    if (zoneBad) continue;
    if (zoneIds.length === 0) {
      errors.push({ row: rowNum, message: "لم تُحدد مناطق صالحة." });
      continue;
    }

    const permPartial: Partial<Record<AppPermissionKey, boolean>> = {};
    for (const key of APP_PERMISSION_KEYS) {
      if (key === "view_tickets") {
        const direct = pickCell(row, "view_tickets", "perm_view_tickets");
        const fromTasks = pickCell(row, "view_tasks", "perm_view_tasks");
        const cell = direct !== "" ? direct : fromTasks;
        if (cell === "") continue;
        const b = parseBool(cell);
        if (typeof b === "boolean") permPartial.view_tickets = b;
        continue;
      }
      const cell = pickCell(row, key, `perm_${key}`);
      if (cell === "") continue;
      const b = parseBool(cell);
      if (typeof b === "boolean") permPartial[key] = b;
    }

    let authEmail: string;
    try {
      authEmail = toAuthEmail(usernameNormalized);
    } catch (e) {
      errors.push({ row: rowNum, message: e instanceof Error ? e.message : "بريد دخول غير صالح." });
      continue;
    }

    if (isProtectedSuperAdminEmail(authEmail)) {
      errors.push({ row: rowNum, message: "لا يُسمح بالرقم المجمع لحساب المدير المحمي." });
      continue;
    }

    const rolePerms = sanitizePermissionPayload(roleRow.permissions);
    const permissions = mergeRoleAndUserOverrides(rolePerms, mergeExplicitInvitePermissions(permPartial));
    const access_work_list = resolveAccessWorkList(accessWorkListRaw, roleRow.legacy_role ?? "technician");
    if (["technician", "engineer", "supervisor"].includes(roleRow.legacy_role ?? "technician")) {
      const limitCheck = await assertWithinTechnicianLimit(adminSupabase, activeCompanyId);
      if (!limitCheck.ok) {
        errors.push({ row: rowNum, message: limitCheck.message });
        continue;
      }
    }

    /** يفعّل البريد في Auth فوراً؛ إن طلب Supabase تأكيداً يدوياً عطّل Confirm email من لوحة المشروع. */
    const { data: createdUser, error: createError } = await adminSupabase.auth.admin.createUser({
      email: authEmail,
      password,
      email_confirm: true,
    });

    if (createError || !createdUser.user?.id) {
      errors.push({ row: rowNum, message: createError?.message ?? "فشل إنشاء الحساب." });
      continue;
    }

    const uid = createdUser.user.id;
    const zoneErr = await upsertProfileAndZones(adminSupabase, uid, {
      fullName,
      mobile,
      jobTitle,
      specialty,
      role: roleRow.legacy_role ?? "technician",
      roleId: roleRow.id,
      zoneIds,
      permissions: { ...permissions, view_admin_reports: permissions.view_reports },
      username: usernameNormalized,
      access_work_list,
      companyId: activeCompanyId,
    });

    if (zoneErr) {
      await adminSupabase.auth.admin.deleteUser(uid);
      errors.push({ row: rowNum, message: zoneErr.message });
      continue;
    }

    if (activeCompanyId) {
      const { error: membershipError } = await adminSupabase.from("company_memberships").upsert(
        {
          user_id: uid,
          company_id: activeCompanyId,
          role_id: roleRow.id,
          status: "active",
          is_owner: false,
        },
        { onConflict: "user_id,company_id" },
      );
      if (membershipError) {
        await adminSupabase.auth.admin.deleteUser(uid);
        errors.push({ row: rowNum, message: membershipError.message });
        continue;
      }
    }

    created.push(usernameNormalized);
  }

  return NextResponse.json({
    ok: errors.length === 0,
    created_count: created.length,
    created,
    errors,
  });
}
