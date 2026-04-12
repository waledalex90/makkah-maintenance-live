import * as XLSX from "xlsx-js-style";
import {
  buildEliteMainDetailsRows,
  buildPeakCompliancePack,
  buildRecurringHotspotsRows,
  buildSuggestedReportsSheetRows,
  buildTechniciansSheetRows,
  buildZonesSectorSheetRows,
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

function applyWorkbookRtl(wb: XLSX.WorkBook) {
  wb.Workbook = wb.Workbook ?? {};
  wb.Workbook.Views = [{ RTL: true } as { RTL?: boolean }];
}

/** حزمة تقارير Excel متعددة الأوراق — تنسيق تنفيذي، RTL، زيبرا، حدود، توسيط. */
export function downloadPremiumReportsExcel(rows: ReportTicketRow[]): void {
  const wb = XLSX.utils.book_new();
  applyWorkbookRtl(wb);

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
    "عمر العطل",
    "زمن الاستجابة",
    "الحالة النهائية",
  ];
  const elite = buildEliteMainDetailsRows(rows);
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
      colWidths: [14, 16, 20, 18, 14, 14, 14, 14, 14, 14, 22, 22, 14],
    }),
    "التفاصيل الرئيسية",
  );

  let techAoa = buildTechniciansSheetRows(rows);
  if (techAoa.length <= 1) {
    techAoa = [techAoa[0]!, ["—", "0", "—", "—"]];
  }
  XLSX.utils.book_append_sheet(
    wb,
    buildStyledMatrixSheet(techAoa, { colWidths: [24, 18, 28, 28] }),
    "أداء الفنيين",
  );

  let zoneAoa = buildZonesSectorSheetRows(rows);
  if (zoneAoa.length <= 1) {
    zoneAoa = [zoneAoa[0]!, ["—", "0", "—", "—"]];
  }
  XLSX.utils.book_append_sheet(
    wb,
    buildStyledMatrixSheet(zoneAoa, { colWidths: [18, 14, 22, 30] }),
    "المناطق والقطاعات",
  );

  const peak = buildPeakCompliancePack(rows);
  const peakAoa = [...peak.hourly, ...peak.complianceBlock];
  const titleRowIndex = peak.hourly.length + 1;
  const subPeak = new Set<number>([titleRowIndex]);
  XLSX.utils.book_append_sheet(
    wb,
    buildStyledMatrixSheet(peakAoa, {
      colWidths: [26, 22],
      subheaderRows: subPeak,
    }),
    "الذروة والالتزام",
  );

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
    "أعطال متكررة",
  );

  const ideasAoa = buildSuggestedReportsSheetRows();
  XLSX.utils.book_append_sheet(wb, buildStyledMatrixSheet(ideasAoa, { colWidths: [92] }), "أفكار تقارير");

  const name = `حزمة_تقارير_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, name, { cellStyles: true });
}
