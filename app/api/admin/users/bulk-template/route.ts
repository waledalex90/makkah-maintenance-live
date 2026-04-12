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

/** 1 = واجهة مهام الميدان عند الدخول، 0 = إيقافها؛ إن تُرك فارغاً يُحدَّد تلقائياً (فني/مهندس/مشرف = 1، غيرهم = 0) */
const ACCESS_WORK_LIST_HEADER = "access_work_list";

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

  const headers = [...DATA_HEADERS_AR, ACCESS_WORK_LIST_HEADER, ...PERM_HEADERS];
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

  const instructionsAoa = [
    ["عمود access_work_list"],
    [
      "1 = تفعيل واجهة مهام الميدان (/tasks/my-work) عند تسجيل الدخول. 0 = عدم التوجيه لهذه الواجهة.",
    ],
    [
      "إذا تُرك الخلية فارغة: يُفعَّل تلقائياً للأدوار فني (technician) أو مهندس (engineer) أو مشرف (supervisor) أو إدخال بيانات (data_entry)، ويُعطَّل لبقية الأدوار.",
    ],
  ];
  const wsGuide = XLSX.utils.aoa_to_sheet(instructionsAoa);
  XLSX.utils.book_append_sheet(wb, wsGuide, "إرشادات_access_work_list");

  if (format === "csv") {
    const csv = XLSX.utils.sheet_to_csv(ws);
    const comment =
      "# إرشادات: العمود access_work_list — أدخل 1 للتفعيل أو 0 للإيقاف. فارغ = تلقائي حسب الدور (فني/مهندس/مشرف/إدخال بيانات = 1، غيرهم = 0).\n";
    const body = "\uFEFF" + comment + csv;
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
