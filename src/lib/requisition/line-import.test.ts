import { describe, expect, it } from "vitest";

import { cellText, importLines, MAX_IMPORT_LINES, parseCsv } from "./line-import";

const H = ["Description", "Quantity", "Unit", "Unit price (RM)", "Amount (RM)"];

describe("parseCsv", () => {
  it("reads rows, quoted commas, doubled quotes and line breaks inside quotes", () => {
    expect(parseCsv('a,"b, c","say ""hi""","x\ny"\n1,2,3,4')).toEqual([
      ["a", "b, c", 'say "hi"', "x\ny"],
      ["1", "2", "3", "4"],
    ]);
  });
  it("drops a byte order mark and reads CRLF, LF and CR alike", () => {
    expect(parseCsv("﻿a,b\r\nc,d\re,f\ng,h\r\n")).toEqual([["a", "b"], ["c", "d"], ["e", "f"], ["g", "h"]]);
  });
  it("keeps empty cells and a row of nothing but commas", () => {
    expect(parseCsv("a,,c\n,,\n")).toEqual([["a", "", "c"], ["", "", ""]]);
  });
  it("adds no row for a final newline, and reads empty input as no rows", () => {
    expect(parseCsv("a\n")).toEqual([["a"]]);
    expect(parseCsv("")).toEqual([]);
  });
});

describe("cellText", () => {
  it("reads numbers exactly, formulas by result, rich text joined, and empties as empty", () => {
    expect(cellText(1234.5)).toBe("1234.5");
    expect(cellText(0.0000001)).toBe("0.0000001");
    expect(cellText({ formula: "A1*B1", result: 25 })).toBe("25");
    expect(cellText({ richText: [{ text: "ab" }, { text: "c" }] })).toBe("abc");
    expect(cellText({ error: "#DIV/0!" })).toBe("");
    expect(cellText(null)).toBe("");
    expect(cellText(undefined)).toBe("");
  });
});

describe("importLines", () => {
  it("reads lines, accepting 1,234.50 and 1234.5, and keeps amounts as decimal strings", () => {
    const r = importLines([H, ["Chairs", "10", "pcs", "1,234.50", "12,345.00"], ["Desk", "2", "set", "1234.5", "2469"]]);
    expect(r.problems).toEqual([]);
    expect(r.lines).toEqual([
      { description: "Chairs", quantity: "10", unit: "pcs", estimatedUnitPrice: "1234.50", estimatedAmount: "12345.00" },
      { description: "Desk", quantity: "2", unit: "set", estimatedUnitPrice: "1234.50", estimatedAmount: "2469.00" },
    ]);
  });

  it("maps headers whatever their case, spacing or language, in any order", () => {
    const r = importLines([[" AMOUNT ", "unit price", "qty", "DESCRIPTION", "uom"], ["100", "", "", "Paper", "ream"]]);
    expect(r.lines).toEqual([{ description: "Paper", quantity: "", unit: "ream", estimatedUnitPrice: "", estimatedAmount: "100.00" }]);
    const ms = importLines([["Perihal", "Kuantiti", "Unit", "Harga seunit (RM)", "Jumlah (RM)"], ["Kerusi", "3", "unit", "10", ""]]);
    expect(ms.lines[0]).toMatchObject({ description: "Kerusi", estimatedAmount: "30.00" });
  });

  it("works out a missing amount as quantity x unit price, to the sen, half up", () => {
    const r = importLines([H, ["Cable", "2.5", "m", "3.33", ""], ["Bolt", "3", "pcs", "0.10", ""]]);
    expect(r.lines.map((l) => l.estimatedAmount)).toEqual(["8.33", "0.30"]); // 8.325 rounds up
  });

  it("never lets a float near an amount: a large one stays exact", () => {
    const r = importLines([H, ["Plant", "1", "lot", "", "9007199254740993.07"]]);
    expect(r.lines[0].estimatedAmount).toBe("9007199254740993.07");
  });

  it("skips blank rows and a totals row, and ignores the note rows above the header", () => {
    const r = importLines([["One item per row."], ["Satu item."], H, ["", "", "", "", ""], ["A", "1", "", "5", ""], [" ", "", "", "", ""], ["Total", "", "", "", "5.00"]]);
    expect(r.problems).toEqual([]);
    expect(r.lines).toHaveLength(1);
  });

  it("reports each problem in words with the spreadsheet row number, and keeps the good rows", () => {
    const r = importLines([
      ["Note"], // row 1
      H, // row 2
      ["Good", "1", "", "5", ""], // row 3
      ["Bad amount", "1", "", "", "abc"], // row 4
      ["", "1", "", "5", ""], // row 5
      ["Bad qty", "x", "", "5", ""], // row 6
      ["No figures", "", "", "", ""], // row 7
      ["Three dp", "1", "", "1.234", ""], // row 8
      ["Negative", "1", "", "", "-5"], // row 9
    ]);
    expect(r.lines.map((l) => l.description)).toEqual(["Good"]);
    expect(r.problems.map((p) => p.text.en)).toEqual([
      "Row 4: the amount is not a figure.",
      "Row 5: the description is empty.",
      "Row 6: the quantity is not a figure.",
      "Row 7: there is no amount, and no quantity and unit price to work one out from.",
      "Row 8: the unit price has more than two decimal places.",
      "Row 9: the amount is not a figure.",
    ]);
    expect(r.problems.map((p) => p.row)).toEqual([4, 5, 6, 7, 8, 9]);
    expect(r.problems[0].text.ms).toBe("Baris 4: jumlah bukan angka.");
  });

  it("says so when there is no header row, or no way to get an amount", () => {
    expect(importLines([["a", "b"], ["1", "2"]]).problems[0].text.en).toMatch(/No header row/);
    const r = importLines([["Description", "Unit"], ["x", "y"]]);
    expect(r.lines).toEqual([]);
    expect(r.problems[0].text.en).toMatch(/^Row 1: the columns do not give an amount/);
  });

  it("says so when the file has a header and nothing under it", () => {
    expect(importLines([H]).problems[0].text.en).toMatch(/no lines below/);
  });

  it("caps at 500 lines and says what was left", () => {
    const rows = [H, ...Array.from({ length: 501 }, (_, i) => [`Item ${i}`, "1", "", "1", ""])];
    const r = importLines(rows);
    expect(r.lines).toHaveLength(MAX_IMPORT_LINES);
    expect(r.problems).toHaveLength(1);
    expect(r.problems[0].text.en).toMatch(/first 500 lines/);
    expect(importLines(rows.slice(0, 501)).problems).toEqual([]);
  });

  it("reads a CSV end to end, BOM and quoted commas included", () => {
    const csv = `﻿"Note, with a comma"\r\n${H.join(",")}\r\n"Paper, A4",5,ream,"1,200.50",\r\n`;
    const r = importLines(parseCsv(csv));
    expect(r.lines).toEqual([{ description: "Paper, A4", quantity: "5", unit: "ream", estimatedUnitPrice: "1200.50", estimatedAmount: "6002.50" }]);
  });
});
