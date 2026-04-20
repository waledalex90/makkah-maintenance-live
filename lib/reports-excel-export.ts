import * as XLSX from "xlsx-js-style";
import {
  buildEliteMainDetailsRows,
  buildMonthlyTicketDensityRows,
  buildRecurringHotspotsRows,
  buildSlaByCategorySheetRows,
  buildTechniciansSheetRows,
  buildZonesSectorSheetRows,
  fridayDayNumbersInMonth,
  inferReportReferenceYearMonth,
  type ReportTicketRow,
} from "@/lib/reports-analytics";

const HEADER_STYLE = {
  font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11 },
  fill: { fgColor: { rgb: "1E4D7B" } },
  alignment: { horizontal: "center", vertical: "center", wrapText: true },
  border: {
    top: { style: "thin", color: { rgb: "0F2942" } },
    bottom: { style: "thin", color: { rgb: "0F2942" } },
    left: { style: "thin", color: { rgb: "0F2942" } },
    right: { style: "thin", color: { rgb: "0F2942" } },
  },
};

const SUBHEADER_STYLE = {
  font: { bold: true, color: { rgb: "FFFFFF" }, sz: 10 },
  fill: { fgColor: { rgb: "3B6E99" } },
  alignment: { horizontal: "center", vertical: "center", wrapText: true },
  border: {
    top: { style: "thin", color: { rgb: "0F2942" } },
    bottom: { style: "thin", color: { rgb: "0F2942" } },
    left: { style: "thin", color: { rgb: "0F2942" } },
    right: { style: "thin", color: { rgb: "0F2942" } },
  },
};

const ZEBRA_LIGHT = { fgColor: { rgb: "F0F7FF" } };
const ZEBRA_WHITE = { fgColor: { rgb: "FFFFFF" } };

/** عمود أيام الجمعة في ورقة الشهر — خلفية مميزة مع بقاء النص أبيض للرأس */
const FRIDAY_HEADER_FILL = { fgColor: { rgb: "B45309" } };
const FRIDAY_CELL_LIGHT = { fgColor: { rgb: "FEF3C7" } };
const FRIDAY_CELL_ALT = { fgColor: { rgb: "FDE68A" } };

function dataStyleWithZebra(isZebra: boolean) {
  return {
    font: { bold: false, color: { rgb: "1E293B" }, sz: 10 },
    fill: isZebra ? ZEBRA_LIGHT : ZEBRA_WHITE,
    alignment: { horizontal: "center", vertical: "center", wrapText: true },
    border: {
      top: { style: "thin", color: { rgb: "CBD5E1" } },
      bottom: { style: "thin", color: { rgb: "CBD5E1" } },
      left: { style: "thin", color: { rgb: "CBD5E1" } },
      right: { style: "thin", color: { rgb: "CBD5E1" } },
    },
  };
}

function fridayDataStyle(isZebra: boolean) {
  return {
    font: { bold: false, color: { rgb: "1E293B" }, sz: 10 },
    fill: isZebra ? FRIDAY_CELL_LIGHT : FRIDAY_CELL_ALT,
    alignment: { horizontal: "center", vertical: "center", wrapText: true },
    border: {
      top: { style: "thin", color: { rgb: "D97706" } },
      bottom: { style: "thin", color: { rgb: "D97706" } },
      left: { style: "thin", color: { rgb: "D97706" } },
      right: { style: "thin", color: { rgb: "D97706" } },
    },
  };
}

function padRow(row: string[], colCount: number): string[] {
  const out = [...row];
  while (out.length < colCount) out.push("");
  return out.slice(0, colCount);
}

type StyleSheetOptions = {
  colWidths: number[];
  subheaderRows?: Set<number>;
};

function buildStyledMatrixSheet(aoa: string[][], opts: StyleSheetOptions): XLSX.WorkSheet {
  const maxCols = Math.max(opts.colWidths.length, ...aoa.map((r) => r.length), 1);
  const padded = aoa.map((r) => padRow(r, maxCols));
  const ws = XLSX.utils.aoa_to_sheet(padded);
  ws["!cols"] = opts.colWidths.map((wch) => ({ wch }));

  const ref = ws["!ref"];
  if (!ref) return ws;
  const range = XLSX.utils.decode_range(ref);
  const sub = opts.subheaderRows ?? new Set<number>();

  for (let R = range.s.r; R <= range.e.r; R++) {
    const isHeader = R === 0;
    const isSub = sub.has(R);
    const isZebra = R >= 1 && !isSub && (R - 1) % 2 === 1;
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = ws[addr];
      if (!cell) continue;
      if (isHeader) cell.s = { ...HEADER_STYLE };
      else if (isSub) cell.s = { ...SUBHEADER_STYLE };
      else cell.s = dataStyleWithZebra(isZebra);
    }
  }
  return ws;
}

/** ورقة كثافة الشهر: تمييز أعمدة أيام الجمعة (العمود 0 = المنطقة، 1..31 = أيام الشهر) */
function buildStyledMonthlyDensitySheet(
  aoa: string[][],
  colWidths: number[],
  fridayDayNumbers: Set<number>,
): XLSX.WorkSheet {
  const maxCols = Math.max(colWidths.length, ...aoa.map((r) => r.length), 1);
  const padded = aoa.map((r) => padRow(r, maxCols));
  const ws = XLSX.utils.aoa_to_sheet(padded);
  ws["!cols"] = colWidths.map((wch) => ({ wch }));

  const ref = ws["!ref"];
  if (!ref) return ws;
  const range = XLSX.utils.decode_range(ref);

  for (let R = range.s.r; R <= range.e.r; R++) {
    const isHeader = R === 0;
    const isZebra = R >= 1 && (R - 1) % 2 === 1;
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = ws[addr];
      if (!cell) continue;
      const isFridayCol = C >= 1 && C <= 31 && fridayDayNumbers.has(C);
      if (isHeader) {
        cell.s = isFridayCol ? { ...HEADER_STYLE, fill: FRIDAY_HEADER_FILL } : { ...HEADER_STYLE };
      } else if (isFridayCol) {
        cell.s = fridayDataStyle(isZebra);
      } else {
        cell.s = dataStyleWithZebra(isZebra);
      }
    }
  }
  return ws;
}

function applyWorkbookRtl(wb: XLSX.WorkBook) {
  wb.Workbook = wb.Workbook ?? {};
  wb.Workbook.Views = [{ RTL: true } as { RTL?: boolean }];
}

export const REPORT_SHEET_IDS = ["main", "technicians", "zones", "recurring", "monthly_density", "sla"] as const;

export type ReportSheetId = (typeof REPORT_SHEET_IDS)[number];

export type ReportExportSelection = Record<ReportSheetId, boolean>;

export const REPORT_SHEET_LABELS_AR: Record<ReportSheetId, string> = {
  main: "التفاصيل الرئيسية",
  technicians: "أداء الفنيين",
  zones: "المناطق والقطاعات",
  recurring: "أعطال متكررة",
  monthly_density: "كثافة البلاغات الشهرية",
  sla: "الالتزام حسب التصنيف",
};

export function defaultReportExportSelection(): ReportExportSelection {
  return {
    main: true,
    technicians: true,
    zones: true,
    recurring: false,
    monthly_density: true,
    sla: true,
  };
}

export function selectedSheetIds(sel: ReportExportSelection): ReportSheetId[] {
  return REPORT_SHEET_IDS.filter((id) => sel[id]);
}

function monthlyDensityColWidths(): number[] {
  return [20, ...Array(31).fill(6)];
}

const REPORT_FILE_SLUG: Record<ReportSheetId, string> = {
  main: "details",
  technicians: "technicians",
  zones: "zones",
  recurring: "recurring",
  monthly_density: "monthly_density",
  sla: "sla_by_category",
};

export type ReportExportContext = {
  dateFrom?: string;
  dateTo?: string;
  /** مهلة الاستلام بالدقائق لعمود «الحالة النهائية» وورقة التفاصيل */
  pickupSlackMinutes?: number;
};

function appendSheetsForSelection(
  wb: XLSX.WorkBook,
  rows: ReportTicketRow[],
  sel: ReportExportSelection,
  ctx: ReportExportContext,
): void {
  if (sel.main) {
    const mainHeaders = [
      "رقم البلاغ",
      "المنطقة",
      "الفني",
      "التصنيف",
      "تاريخ الإنشاء (مكة)",
      "وقت الإنشاء (مكة)",
      "تاريخ الاستلام",
      "وقت الاستلام",
      "تاريخ الإغلاق",
      "وقت الإغلاق",
      "عمر العطل (HH:mm:ss)",
      "زمن الاستجابة (HH:mm:ss)",
      "الحالة النهائية",
    ];
    const elite = buildEliteMainDetailsRows(rows, Date.now(), ctx.pickupSlackMinutes);
    const mainAoa: string[][] = [
      mainHeaders,
      ...elite.map((e) => [
        e.ticketNumber,
        e.zone,
        e.technician,
        e.category,
        e.createDate,
        e.createTime,
        e.recvDate,
        e.recvTime,
        e.closeDate,
        e.closeTime,
        e.faultHms,
        e.responseHms,
        e.finalStatus,
      ]),
    ];
    XLSX.utils.book_append_sheet(
      wb,
      buildStyledMatrixSheet(mainAoa, {
        colWidths: [14, 16, 20, 18, 14, 14, 14, 14, 14, 14, 18, 20, 14],
      }),
      REPORT_SHEET_LABELS_AR.main,
    );
  }

  if (sel.technicians) {
    let techAoa = buildTechniciansSheetRows(rows);
    if (techAoa.length <= 1) {
      techAoa = [techAoa[0]!, ["—", "0", "—", "—"]];
    }
    XLSX.utils.book_append_sheet(
      wb,
      buildStyledMatrixSheet(techAoa, { colWidths: [24, 18, 28, 28] }),
      REPORT_SHEET_LABELS_AR.technicians,
    );
  }

  if (sel.zones) {
    let zoneAoa = buildZonesSectorSheetRows(rows);
    if (zoneAoa.length <= 1) {
      zoneAoa = [zoneAoa[0]!, ["—", "0", "—", "—"]];
    }
    XLSX.utils.book_append_sheet(
      wb,
      buildStyledMatrixSheet(zoneAoa, { colWidths: [18, 14, 22, 30] }),
      REPORT_SHEET_LABELS_AR.zones,
    );
  }

  if (sel.recurring) {
    let recurAoa = buildRecurringHotspotsRows(rows);
    if (recurAoa.length <= 1) {
      recurAoa = [
        recurAoa[0]!,
        ["—", "—", "—", "—", "لا يوجد تكرار (نفس اليوم + المنطقة + التصنيف) مرتين فأكثر"],
      ];
    }
    XLSX.utils.book_append_sheet(
      wb,
      buildStyledMatrixSheet(recurAoa, { colWidths: [14, 18, 20, 16, 52] }),
      REPORT_SHEET_LABELS_AR.recurring,
    );
  }

  if (sel.monthly_density) {
    const aoa = buildMonthlyTicketDensityRows(rows);
    const { year, month } = inferReportReferenceYearMonth(ctx.dateFrom, ctx.dateTo, rows);
    const fridays = fridayDayNumbersInMonth(year, month);
    XLSX.utils.book_append_sheet(
      wb,
      buildStyledMonthlyDensitySheet(aoa, monthlyDensityColWidths(), fridays),
      REPORT_SHEET_LABELS_AR.monthly_density,
    );
  }

  if (sel.sla) {
    const aoa = buildSlaByCategorySheetRows(rows);
    XLSX.utils.book_append_sheet(
      wb,
      buildStyledMatrixSheet(aoa, { colWidths: [22, 14, 36, 14] }),
      REPORT_SHEET_LABELS_AR.sla,
    );
  }
}

export type ReportExportMode = "single_workbook" | "separate_files";

/** تصدير حسب الاختيار: ملف واحد (أوراق مختارة فقط) أو ملف Excel منفصل لكل تقرير */
export function downloadPremiumReportsExcel(
  rows: ReportTicketRow[],
  selection: ReportExportSelection = defaultReportExportSelection(),
  mode: ReportExportMode = "single_workbook",
  ctx: ReportExportContext = {},
): void {
  const ids = selectedSheetIds(selection);
  if (ids.length === 0) return;

  const date = new Date().toISOString().slice(0, 10);

  if (mode === "single_workbook") {
    const wb = XLSX.utils.book_new();
    applyWorkbookRtl(wb);
    appendSheetsForSelection(wb, rows, selection, ctx);
    const name = `حزمة_تقارير_${date}.xlsx`;
    XLSX.writeFile(wb, name, { cellStyles: true });
    return;
  }

  ids.forEach((id, idx) => {
    const partial: ReportExportSelection = { ...selection };
    for (const k of REPORT_SHEET_IDS) partial[k] = k === id;
    window.setTimeout(() => {
      const wb = XLSX.utils.book_new();
      applyWorkbookRtl(wb);
      appendSheetsForSelection(wb, rows, partial, ctx);
      XLSX.writeFile(wb, `report_${REPORT_FILE_SLUG[id]}_${date}.xlsx`, { cellStyles: true });
    }, idx * 250);
  });
}
