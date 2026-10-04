import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { VALUE_SULIT_LABEL } from "@/lib/documents/labels";

import { canExport, DataList, hasRowAction, type Column, type Row } from "./data-list";

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
  it("the header carries the SULIT lock with the whole sentence in its tooltip and to a screen reader", () => {
    // Founder, 2026-10-04: a lock beside the column name replaces the "SULIT" chip. The mark stays:
    // the whole sentence (classified, not yet restricted) is both the tooltip and the sr-only text.
    const out = html(flagged);
    expect(out).toContain(`title="${VALUE_SULIT_LABEL}"`);
    expect(out).toContain(`<span class="sr-only">${VALUE_SULIT_LABEL}</span>`);
    expect(html(plain)).not.toContain("SULIT");
  });
  it("one flagged column among many is enough", () => {
    expect(canExport([...plain, { key: "x", label: "X", sulit: true }])).toBe(false);
  });
});

describe("a list's per-row actions (6.6 review S-2)", () => {
  const cols: Column[] = [{ key: "name", label: "Name" }];
  const two: Row[] = [
    { id: "1", search: "a", cells: { name: { kind: "text", text: "A" } } },
    { id: "2", search: "b", cells: { name: { kind: "text", text: "B" } }, note: "Why B has none" },
  ];
  const render = (props: Record<string, unknown>) => renderToStaticMarkup(createElement(DataList, { columns: cols, rows: two, ...props }));
  const button = (id: string) => createElement("button", { type: "button" }, `Act on ${id}`);

  it("nothing, false, true, an empty string and an empty array are no action; anything else is one", () => {
    for (const n of [null, undefined, false, true, "", [], [null, false]]) expect(hasRowAction(n)).toBe(false);
    for (const n of [button("1"), "Text", 0, [null, button("1")]]) expect(hasRowAction(n)).toBe(true);
  });
  it("no row with an action: no Actions column at all", () => {
    const out = render({ actions: () => null });
    expect(out).not.toContain(">Actions<");
    expect(out.match(/<col\b/g)?.length ?? 0).toBe(2); // the selection column and Name, nothing for actions
    expect(out).toMatch(/colSpan="2"|colspan="2"/);
  });
  it("one row with an action keeps the column, and the row without one renders nothing in it", () => {
    const out = render({ actions: (id: string) => (id === "1" ? button(id) : null) });
    expect(out).toContain(">Actions<");
    expect(out).toContain("Act on 1");
    expect(out).not.toContain("Act on 2");
  });
  it("actions placed below take no column and sit on the line under their row, beside its note", () => {
    const out = render({ actions: (id: string) => button(id), actionsPlacement: "below" });
    expect(out).not.toContain(">Actions<");
    expect(out.match(/data-rowactions/g)?.length).toBe(2);
    // Row 2's action shares the full-width line with its note.
    expect(out).toMatch(/Why B has none<\/span><div data-rowactions[^>]*><button[^>]*>Act on 2/);
  });
  it("below, a row with no action and no note gets no extra line", () => {
    const out = render({ actions: (id: string) => (id === "2" ? button(id) : null), actionsPlacement: "below" });
    expect(out.match(/data-rowactions/g)?.length).toBe(1);
    expect(out).toContain("Act on 2");
  });
  it("a row link with no actions renderer keeps its arrow column, as before", () => {
    const out = render({ rowAction: { label: "Open", hrefTemplate: "/x/{id}" } });
    expect(out.match(/<col\b/g)?.length).toBe(3);
    expect(out).toContain('aria-label="Open"');
  });
});

describe("a chip's provenance tag (6.13A residual: the shared badge, never '(assumed reading)')", () => {
  const cols: Column[] = [{ key: "phase", label: "Where it stands" }];
  const row = (provenance?: "ASSUMED"): Row => ({ id: "1", search: "a", cells: { phase: { kind: "chips", items: [{ text: "Active" }, { text: "In Delay", tone: "err", ...(provenance ? { provenance } : {}) }] } } });
  const render = (r: Row) => renderToStaticMarkup(createElement(DataList, { columns: cols, rows: [r] }));
  it("a chip with provenance carries the shared Assumed badge beside it", () => {
    const out = render(row("ASSUMED"));
    expect(out).toContain(">In Delay<");
    expect(out).toContain(">Assumed<");
    expect(out).not.toContain("assumed reading");
  });
  it("without it, no badge", () => {
    expect(render(row())).not.toContain(">Assumed<");
  });
});
