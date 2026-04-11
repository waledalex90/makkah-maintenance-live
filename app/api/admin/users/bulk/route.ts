import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireManageUsers } from "@/lib/auth-guards";
import { mergeInvitePermissions } from "@/lib/dashboard-user-permissions";
import { upsertProfileAndZones } from "@/lib/server/provision-dashboard-user";
import { parseUsernameOrEmailLocalPart, toAuthEmail } from "@/lib/username-auth";
import { APP_PERMISSION_KEYS, type AppPermissionKey } from "@/lib/permissions";
import { isProtectedSuperAdminEmail } from "@/lib/protected-super-admin";

type Role =
  | "admin"
  | "projects_director"
  | "project_manager"
  | "engineer"
  | "supervisor"
  | "technician"
  | "reporter";

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
      const text = buffer.toString("utf-8").replace(/^\uFEFF/, "");
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
  const { data: zonesData } = await adminSupabase.from("zones").select("id, name");
  const zoneByName = new Map((zonesData ?? []).map((z) => [z.name.trim().toLowerCase(), z.id]));

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
    const roleStr = (pickCell(row, "role", "الدور") || "technician") as Role;
    const zonesCell = pickCell(row, "zones", "المنطقة", "المناطق", "مناطق");

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

    const permissions = mergeInvitePermissions(roleStr, permPartial);

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
      role: roleStr,
      zoneIds,
      permissions,
      username: usernameNormalized,
    });

    if (zoneErr) {
      await adminSupabase.auth.admin.deleteUser(uid);
      errors.push({ row: rowNum, message: zoneErr.message });
      continue;
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
