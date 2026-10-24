import ExcelJS from "exceljs";

import type { Cell } from "@/lib/ui/list-cells";

/**
 * A list as an Excel file (ST-9, plan 7.5): one sheet, a bold frozen header row, widths from the label length.
 * A `text` cell is always a string (never a formula, whatever it starts with, and "0123" keeps its zero); `money` arrives as the
 * Decimal string and becomes a number here, the one place (AGENTS.md rule 4); `date` arrives as a "YYYY-MM-DD" day.
 */
export type XlsxColumn = { header: string; type: "text" | "money" | "date" };

export const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function listToXlsx(sheetName: string, columns: readonly XlsxColumn[], rows: readonly (readonly (string | null)[])[]): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet(sheetName.slice(0, 31), { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = columns.map((c) => ({ header: c.header, width: Math.max(12, c.header.length + 4), style: c.type === "text" ? { numFmt: "@" } : c.type === "money" ? { numFmt: "#,##0.00" } : { numFmt: "yyyy-mm-dd" } }));
  sheet.getRow(1).font = { bold: true };
  for (const r of rows) {
    sheet.addRow(
      columns.map((c, i) => {
        const v = r[i];
        if (v == null || v === "") return null;
        if (c.type === "money") return Number(v);
        if (c.type === "date") return new Date(`${v}T00:00:00Z`);
        return v;
      }),
    );
  }
  return Buffer.from(await book.xlsx.writeBuffer());
}

/// A cell's first and second line as plain text (a stack's title and sub, a link's text and sub); the second is "" where there is none.
export function cellParts(cell: Cell | undefined): [string, string] {
  if (!cell) return ["", ""];
  if (cell.kind === "stack") return [cell.title, cell.sub ?? ""];
  if (cell.kind === "link") return [cell.text, cell.sub ?? ""];
  if (cell.kind === "text" || cell.kind === "badge" || cell.kind === "chip") return [cell.text, ""];
  if (cell.kind === "chips") return [cell.items.map((i) => i.text).join(" · "), ""];
  return ["", ""];
}

/// The response for a finished file: an attachment, never cached.
export function xlsxResponse(file: Buffer, fileName: string): Response {
  return new Response(new Uint8Array(file), {
    headers: { "Content-Type": XLSX_TYPE, "Content-Disposition": `attachment; filename="${fileName}"`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

/// An address's query as the page's `searchParams` read it (a repeated parameter is an array), so the route parses the same query the screen did.
export function queryParams(url: URL): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [k, v] of url.searchParams) out[k] = k in out ? [...[out[k]].flat(), v] : v;
  return out;
}

/// A refusal: a stable code and a message in words.
export const exportRefusal = (status: number, code: string, message: string): Response => Response.json({ ok: false, code, message }, { status, headers: { "Cache-Control": "no-store" } });

/// A view over the ceiling is told in words, with the number (ST-10).
export const EXPORT_TOO_LARGE = (max: number) => `This view has more than ${max.toLocaleString("en-MY")} rows, which is more than one file holds. Narrow the search or pick a smaller view.`;
