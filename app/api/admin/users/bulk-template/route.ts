import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { requireManageUsers } from "@/lib/auth-guards";

/** صف العناوين يطابق مفاتيح التعرف في مسار الرفع الجماعي */
const DATA_HEADERS_AR = [
  "الاسم",
  "اسم_المستخدم",
  "كلمة_المرور",
  "الدور",
  "التخصص",
  "المنطقة",
  "الجوال",
  "المهنة",
];

const PERM_HEADERS = [
  "view_dashboard",
  "view_tickets",
  "view_tasks",
  "view_map",
  "view_reports",
  "manage_zones",
  "manage_users",
  "view_settings",
];

export async function GET(request: Request) {
  const access = await requireManageUsers();
  if (!access.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: access.status });
  }

  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format") === "csv" ? "csv" : "xlsx";

  const headers = [...DATA_HEADERS_AR, ...PERM_HEADERS];
  const example = [
    "أحمد مثال",
    "ahmed.example",
    "ChangeMe123!",
    "technician",
    "electricity",
    "اسم منطقة مطابقة من النظام",
    "0500000000",
    "فني كهرباء",
    1,
    1,
    0,
    1,
    0,
    0,
    0,
    0,
  ];

  const aoa = [headers, example];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "مستخدمون");

  if (format === "csv") {
    const csv = XLSX.utils.sheet_to_csv(ws);
    const body = "\uFEFF" + csv;
    return new NextResponse(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="bulk-users-template.csv"',
      },
    });
  }

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="bulk-users-template.xlsx"',
    },
  });
}
