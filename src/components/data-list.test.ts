import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { VALUE_SULIT_LABEL } from "@/lib/documents/labels";

import { canExport, DataList, type Column, type Row } from "./data-list";

const rows: Row[] = [{ id: "1", search: "a", cells: { name: { kind: "text", text: "A" }, value: { kind: "money", value: 1500 } } }];
const html = (columns: Column[]) => renderToStaticMarkup(createElement(DataList, { columns, rows }));
const plain: Column[] = [{ key: "name", label: "Name" }, { key: "value", label: "Value", numeric: true, sortable: true }];
const flagged: Column[] = [{ key: "name", label: "Name" }, { key: "value", label: "Value", numeric: true, sortable: true, sulit: true }];

describe("a SULIT column and the list's export", () => {
  it("an ordinary list offers Export", () => {
    expect(canExport(plain)).toBe(true);
    expect(html(plain)).toContain("Download this view as CSV");
  });
  it("a flagged column removes Export, and keeps search, sort and density", () => {
    expect(canExport(flagged)).toBe(false);
    const out = html(flagged);
    expect(out).not.toContain("Download this view as CSV");
    expect(out).not.toMatch(/CSV/);
    expect(out).toContain("Search this list");
    expect(out).toContain("Row density");
    expect(out).toContain("<button");
  });
  it("the header carries the SULIT chip with the whole sentence available", () => {
    const out = html(flagged);
    expect(out).toContain(">SULIT<");
    expect(out).toContain(VALUE_SULIT_LABEL);
    expect(html(plain)).not.toContain("SULIT");
  });
  it("one flagged column among many is enough", () => {
    expect(canExport([...plain, { key: "x", label: "X", sulit: true }])).toBe(false);
  });
});
