import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { fileKind, MAX_UPLOAD_BYTES, readUpload } from "./line-import-file";
import { importLines, parseCsv } from "./line-import";
import { csvTemplate, TEMPLATE_HEADERS, xlsxTemplate } from "./line-template";

// Founder, 2026-10-19: English only. The Malay half of this file's word pairs and assertions was removed; the rule assertions are unchanged.

const enc = (s: string) => new TextEncoder().encode(s);

describe("the template", () => {
  it("is a workbook with the five columns, money formatted #,##0.00, and reads back as an empty template", async () => {
    const bytes = await xlsxTemplate();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes as unknown as ArrayBuffer);
    expect(wb.worksheets).toHaveLength(1);
    const ws = wb.worksheets[0];
    const headerRow = ws.getRow(2).values as unknown[];
    expect(headerRow.slice(1)).toEqual([...TEMPLATE_HEADERS]);
    expect(String(ws.getCell(1, 1).value)).toMatch(/quantity × unit price/);
    expect(ws.getColumn(4).numFmt).toBe("#,##0.00");
    expect(ws.getColumn(5).numFmt).toBe("#,##0.00");
    const r = await readUpload("t.xlsx", bytes);
    expect(r.lines).toEqual([]);
    expect(r.problems[0].text.en).toMatch(/no lines below/);
  });

  it("has a CSV twin with the same columns, a BOM and the same note", () => {
    const csv = csvTemplate();
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const rows = parseCsv(csv);
    expect(rows.find((r) => r[0] === "Description")).toEqual([...TEMPLATE_HEADERS]);
    expect(rows[0][0]).toMatch(/quantity × unit price/);
    expect(importLines(rows).problems[0].text.en).toMatch(/no lines below/);
  });
});

describe("readUpload", () => {
  async function filled() {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Lines");
    ws.addRow(["Note row"]);
    ws.addRow([...TEMPLATE_HEADERS]);
    ws.addRow(["Chairs", 10, "pcs", 1234.5, null]); // numeric cells, amount left empty
    ws.addRow(["Desks", "2", "set", "1,000.00", "2,000.00"]); // text cells
    ws.addRow(["Broken", 1, "pcs", 5, "twelve"]);
    ws.addRow([]);
    ws.addRow(["Formula", 2, "pcs", 3, { formula: "B7*D7", result: 6 }]);
    return new Uint8Array(await wb.xlsx.writeBuffer());
  }

  it("reads a filled .xlsx: numbers, text, a formula, a blank row, and one bad row by its row number", async () => {
    const r = await readUpload("lines.XLSX", await filled());
    expect(r.lines.map((l) => [l.description, l.estimatedAmount])).toEqual([
      ["Chairs", "12345.00"],
      ["Desks", "2000.00"],
      ["Formula", "6.00"],
    ]);
    expect(r.problems.map((p) => p.text.en)).toEqual(["Row 5: the amount is not a figure."]);
  });

  it("reads a filled .csv the same way", async () => {
    const csv = `${[...TEMPLATE_HEADERS].join(",")}\r\nChairs,10,pcs,"1,234.50",\r\nBroken,1,pcs,5,twelve\r\n`;
    const r = await readUpload("lines.csv", enc(csv));
    expect(r.lines.map((l) => l.estimatedAmount)).toEqual(["12345.00"]);
    expect(r.problems.map((p) => p.text.en)).toEqual(["Row 3: the amount is not a figure."]);
  });

  it("refuses other file types, a renamed non-workbook, a corrupt workbook and an oversized file, in words", async () => {
    for (const [name, bytes] of [
      ["lines.pdf", enc("%PDF")],
      ["lines.xlsx", enc("not a zip")],
      ["lines.csv", new Uint8Array([0x50, 0x4b, 3, 4])],
      ["lines.xlsx", new Uint8Array([0x50, 0x4b, 1, 2, 3])],
      ["lines.csv", new Uint8Array(MAX_UPLOAD_BYTES + 1)],
    ] as const) {
      const r = await readUpload(name, bytes);
      expect(r.lines).toEqual([]);
      expect(r.problems).toHaveLength(1);
      expect(r.problems[0].row).toBeNull();
    }
  });

  it("tells a workbook from a csv by name and first bytes", () => {
    expect(fileKind("a.xlsx", new Uint8Array([0x50, 0x4b]))).toBe("xlsx");
    expect(fileKind("a.csv", enc("a,b"))).toBe("csv");
    expect(fileKind("a.txt", enc("a,b"))).toBeNull();
  });
});
