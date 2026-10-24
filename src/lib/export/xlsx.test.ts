import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { cellParts, listToXlsx, queryParams } from "./xlsx";

async function read(file: Buffer) {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(file as unknown as ArrayBuffer);
  return book.worksheets[0];
}

describe("listToXlsx", () => {
  it("keeps a formula-looking text and a leading zero as text, a Malay name whole, and makes money a number and a day a date", async () => {
    const file = await listToXlsx(
      "List",
      [
        { header: "Reference", type: "text" },
        { header: "Registration", type: "text" },
        { header: "Name", type: "text" },
        { header: "Amount", type: "money" },
        { header: "Day", type: "date" },
      ],
      [["=1+1", "0123", "Nur Aisyah binti Ab. Rahman", "1234567.89", "2026-10-24"]],
    );
    const sheet = await read(file);
    const row = sheet.getRow(2);
    expect(row.getCell(1).value).toBe("=1+1");
    expect(row.getCell(1).type).toBe(ExcelJS.ValueType.String);
    expect(row.getCell(2).value).toBe("0123");
    expect(row.getCell(3).value).toBe("Nur Aisyah binti Ab. Rahman");
    expect(row.getCell(4).value).toBe(1234567.89);
    expect(row.getCell(4).numFmt).toBe("#,##0.00");
    expect((row.getCell(5).value as Date).toISOString().slice(0, 10)).toBe("2026-10-24");
  });

  it("writes a bold frozen header row and leaves empty cells empty", async () => {
    const sheet = await read(await listToXlsx("List", [{ header: "A", type: "text" }, { header: "B", type: "money" }], [["x", null]]));
    expect(sheet.getRow(1).font?.bold).toBe(true);
    expect(sheet.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
    expect(sheet.getRow(2).getCell(2).value).toBeNull();
    expect(sheet.rowCount).toBe(2);
  });
});

describe("helpers", () => {
  it("reads an address's repeated parameter as an array, as the page's searchParams do", () => {
    expect(queryParams(new URL("http://x/?q=a&view=b&view=c"))).toEqual({ q: "a", view: ["b", "c"] });
  });
  it("splits a stack and a link into two lines, and a withheld cell into none", () => {
    expect(cellParts({ kind: "stack", title: "A", sub: "B" })).toEqual(["A", "B"]);
    expect(cellParts({ kind: "link", text: "T", href: "/x" })).toEqual(["T", ""]);
    expect(cellParts({ kind: "withheld", words: "no" })).toEqual(["", ""]);
  });
});
