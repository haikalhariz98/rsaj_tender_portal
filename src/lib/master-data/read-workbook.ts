import ExcelJS from "exceljs";

import { COLUMNS, TAB_ORDER, type RawBook, type RawTab } from "./plan";

const two = (n: number) => String(n).padStart(2, "0");

/// One cell as text. A real date cell is unambiguous, so it is written back as DD-MM-YYYY for the plan to read; a number is its plain digits.
export function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (v instanceof Date) return `${two(v.getUTCDate())}-${two(v.getUTCMonth() + 1)}-${v.getUTCFullYear()}`;
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((t) => t.text).join("").trim();
    if ("result" in v) return cellText(v.result as ExcelJS.CellValue);
    if ("text" in v) return cellText(v.text as ExcelJS.CellValue); // a hyperlink, as an email often is
    return "";
  }
  return String(v).trim();
}

/// Reads the workbook's tabs: row 1 the column names (up to the first blank, because the hint text sits after a gap), row 2 the hints, data from row 3.
/// The file is only read. A tab that is not there is left out of the book, and the plan says so.
export async function readWorkbook(file: string): Promise<RawBook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const book: RawBook = {};
  for (const name of TAB_ORDER) {
    const ws = wb.getWorksheet(name);
    if (!ws) continue;
    const headers: string[] = [];
    for (let c = 1; c <= Math.max(ws.columnCount, COLUMNS[name].length); c++) {
      const h = cellText(ws.getRow(1).getCell(c).value);
      if (!h) break;
      headers.push(h);
    }
    const tab: RawTab = { headers, rows: [] };
    for (let r = 3; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const cells = Object.fromEntries(headers.map((h, i) => [h, cellText(row.getCell(i + 1).value)]));
      if (Object.values(cells).some((v) => v !== "")) tab.rows.push({ row: r, cells });
    }
    book[name] = tab;
  }
  return book;
}
