import { describe, expect, it } from "vitest";

import { canExport, cellText, CSV_BOM, exportColumns, listCsv, type Column, type Row } from "./list-cells";

/**
 * The pure cell text moved out of `data-list.tsx` (plan 7.1), and the in-card list's CSV, which now starts with a UTF-8 byte-order
 * mark so Excel reads a Malay name as written (ST-9, NFR-LNG-004). The audit trail's CSV (`listToCsv` alone) is unchanged: its
 * digest is over its own bytes.
 */

const columns: Column[] = [
  { key: "name", label: "Name" },
  { key: "value", label: "Value", numeric: true },
  { key: "price", label: "Price", sulit: true },
];
const rows: Row[] = [
  { id: "1", search: "", cells: { name: { kind: "stack", title: "Syarikat Dato' Seri Haji Abd. Rahman", sub: "0123456-K" }, value: { kind: "money", sen: "150050" }, price: { kind: "money", value: 99 } } },
  { id: "2", search: "", cells: { name: { kind: "text", text: "=HYPERLINK(\"x\")" }, value: { kind: "money", value: null }, price: { kind: "withheld", words: "Hidden" } } },
];

describe("listCsv", () => {
  it("starts with the byte-order mark, and the header follows it", () => {
    const csv = listCsv(columns, rows);
    expect(csv.startsWith(CSV_BOM)).toBe(true);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1).split("\r\n")[0]).toBe('"Name","Value"');
  });
  it("leaves the SULIT column out, keeps a Malay name and a leading zero, and guards a formula", () => {
    expect(listCsv(columns, rows).slice(1).split("\r\n").slice(1)).toEqual([`"Syarikat Dato' Seri Haji Abd. Rahman 0123456-K","1500.50"`, `"'=HYPERLINK(""x"")",""`]);
  });
});

describe("cellText and the export columns, as before the move", () => {
  it("a withheld cell is empty; money in sen is exact; status lists every item", () => {
    expect(cellText({ kind: "withheld", words: "Hidden" })).toBe("");
    expect(cellText({ kind: "money", sen: "10" })).toBe("0.10");
    expect(cellText({ kind: "status", main: { text: "Open" }, others: [{ text: "Late" }] })).toBe("Open · Late");
    expect(cellText(undefined)).toBe("");
  });
  it("drops every SULIT column, and a list of only SULIT columns cannot export", () => {
    expect(exportColumns(columns).map((c) => c.key)).toEqual(["name", "value"]);
    expect(canExport([{ key: "p", label: "P", sulit: true }])).toBe(false);
  });
});

describe("the select cell's text", () => {
  it("is the label of the chosen option, so search and the export carry words, not keys", () => {
    const cell = { kind: "select" as const, name: "to", value: "IN_PROGRESS", label: "Status", options: [{ value: "IN_PROGRESS", label: "In progress" }], action: async () => {}, fields: {} };
    expect(cellText(cell)).toBe("In progress");
  });
});
