/**
 * An uploaded file as rows, then as lines. The one place that knows .xlsx from .csv; the
 * meaning of the rows is `importLines`. Server only (exceljs).
 */

import ExcelJS from "exceljs";

import { cellText, importLines, parseCsv, type ImportProblem, type ImportResult } from "@/lib/requisition/line-import";

/// A file larger than this is refused before it is read.
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
/// Rows read from a sheet, blank or not: a sheet formatted down to row a million is not read to its end.
const MAX_SHEET_ROWS = 5000;

const refuse = (en: string): ImportResult => ({ lines: [], problems: [{ row: null, text: { en } }] satisfies ImportProblem[] });

export type FileKind = "xlsx" | "csv";

/// What a file is, from its name and its first bytes: an .xlsx is a zip ("PK"). Null: neither.
export function fileKind(name: string, bytes: Uint8Array): FileKind | null {
  const lower = name.toLowerCase();
  if (lower.endsWith(".xlsx")) return bytes[0] === 0x50 && bytes[1] === 0x4b ? "xlsx" : null;
  if (lower.endsWith(".csv")) return bytes[0] === 0x50 && bytes[1] === 0x4b ? null : "csv";
  return null;
}

export async function readUpload(name: string, bytes: Uint8Array): Promise<ImportResult> {
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    return refuse("The file is larger than 2 MB. Upload only the lines.");
  }
  const kind = fileKind(name, bytes);
  if (!kind) {
    return refuse("The file must be an Excel file (.xlsx) or a CSV file (.csv), made from the template.");
  }
  try {
    if (kind === "csv") return importLines(parseCsv(new TextDecoder("utf-8").decode(bytes)));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    if (!ws) return refuse("The workbook has no sheet.");
    const rows: string[][] = [];
    const last = Math.min(ws.rowCount, MAX_SHEET_ROWS);
    for (let r = 1; r <= last; r++) {
      const row = ws.getRow(r);
      const cells: string[] = [];
      for (let c = 1; c <= Math.max(ws.columnCount, 5); c++) cells.push(cellText(row.getCell(c).value));
      rows.push(cells);
    }
    return importLines(rows);
  } catch {
    return refuse("The file could not be read. Check that it is the template, saved as .xlsx or .csv.");
  }
}
