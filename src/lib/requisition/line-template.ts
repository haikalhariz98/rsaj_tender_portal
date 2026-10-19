/**
 * The line-item template a requisition's lines are uploaded from, as .xlsx and as .csv.
 * Nothing customer-specific: the columns are the form's own, and the note says how the
 * amount is worked out. The reader is `importLines`, which finds the header row by name.
 */

import ExcelJS from "exceljs";

import { csvCell, type Words } from "@/lib/requisition/line-import";

export const TEMPLATE_HEADERS = ["Description", "Quantity", "Unit", "Unit price (RM)", "Amount (RM)"] as const;

/// One note row each, above the header row.
export const TEMPLATE_NOTES: readonly Words[] = [
  {
    en: "One item per row, below the headings. Amount may be left empty: it is then worked out as quantity × unit price.",
  },
];

export const TEMPLATE_BASENAME = "requisition-lines-template";
export const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/// The template as CSV: UTF-8 with a byte order mark so Excel reads the characters, CRLF rows.
export function csvTemplate(): string {
  const note = TEMPLATE_NOTES.map((n) => n.en).map((t) => csvCell(t));
  return `﻿${[...note, TEMPLATE_HEADERS.map(csvCell).join(",")].join("\r\n")}\r\n`;
}

/// The template as a workbook: one sheet, money columns in `#,##0.00`.
export async function xlsxTemplate(): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Lines");
  ws.columns = [
    { width: 52 },
    { width: 12, style: { numFmt: "#,##0.###" } },
    { width: 12 },
    { width: 18, style: { numFmt: "#,##0.00" } },
    { width: 18, style: { numFmt: "#,##0.00" } },
  ];
  let r = 1;
  for (const n of TEMPLATE_NOTES) {
    for (const t of [n.en]) {
      ws.mergeCells(r, 1, r, 5);
      const c = ws.getCell(r, 1);
      c.value = t;
      c.font = { italic: true, color: { argb: "FF475569" } };
      c.alignment = { wrapText: true, vertical: "top" };
      ws.getRow(r).height = 32;
      r++;
    }
  }
  const header = ws.getRow(r);
  header.values = [...TEMPLATE_HEADERS];
  header.font = { bold: true };
  header.eachCell((c, i) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E7FF" } };
    c.border = { bottom: { style: "thin" } };
    c.alignment = { horizontal: i >= 2 && i !== 3 ? "right" : "left" };
  });
  ws.views = [{ state: "frozen", ySplit: r }];
  return new Uint8Array(await wb.xlsx.writeBuffer());
}
