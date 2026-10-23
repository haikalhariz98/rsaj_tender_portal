import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SULIT_COLUMN_WORDS } from "@/lib/sulit-fields";

import { canExport, DataList, exportColumns, hasRowAction, withheldColumns, type Column, type Row } from "./data-list";

const rows: Row[] = [{ id: "1", search: "a", cells: { name: { kind: "text", text: "A" }, value: { kind: "money", value: 1500 } } }];
const html = (columns: Column[]) => renderToStaticMarkup(createElement(DataList, { columns, rows }));
const plain: Column[] = [{ key: "name", label: "Name" }, { key: "value", label: "Value", numeric: true, sortable: true }];
const flagged: Column[] = [{ key: "name", label: "Name" }, { key: "value", label: "Value", numeric: true, sortable: true, sulit: true }];

describe("a SULIT column and the list's export", () => {
  it("an ordinary list offers Export", () => {
    expect(canExport(plain)).toBe(true);
    expect(html(plain)).toContain("Download CSV");
  });
  it("a flagged column is left out of the download, which says so; search and sort stay", () => {
    // Founder, 2026-10-04: a list with a SULIT column downloads its other columns. The guard
    // holds where it matters: the SULIT column never reaches the file.
    expect(canExport(flagged)).toBe(true);
    expect(exportColumns(flagged).map((c) => c.key)).toEqual(["name"]);
    const out = html(flagged);
    expect(out).toContain("Download CSV (SULIT left out)");
    expect(out).toContain("Search this list");
    expect(out).toContain("<button");
  });
  it("a list of SULIT columns only offers no download at all", () => {
    expect(canExport([{ key: "value", label: "Value", sulit: true }])).toBe(false);
    expect(html([{ key: "value", label: "Value", sulit: true }])).not.toMatch(/CSV/);
  });
  it("the header carries the SULIT lock with the whole sentence in its tooltip and to a screen reader", () => {
    // Founder, 2026-10-04: a lock beside the column name replaces the "SULIT" chip. The mark stays: the whole sentence is both the tooltip and the sr-only text.
    // Phase 3b (a deliberate change to this test, logged): the sentence no longer says "not restricted until sign-in"; cells are judged for the reader, and it says who sees them.
    const out = html(flagged);
    expect(out).toContain(`title="${SULIT_COLUMN_WORDS}"`);
    expect(out).toContain(`<span class="sr-only">${SULIT_COLUMN_WORDS}</span>`);
    expect(SULIT_COLUMN_WORDS).not.toMatch(/until sign-in|not restricted/);
    expect(html(plain)).not.toContain("SULIT");
  });
  it("every flagged column among many is left out, and only those", () => {
    expect(exportColumns([...plain, { key: "x", label: "X", sulit: true }]).map((c) => c.key)).toEqual(["name", "value"]);
    expect(exportColumns(flagged).some((c) => c.sulit)).toBe(false);
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

describe("a status cell (founder, 2026-10-20: 'too much status ... show only one status')", () => {
  const cols: Column[] = [{ key: "phase", label: "Status" }];
  const row = (others: { text: string }[]): Row => ({ id: "1", search: "a", cells: { phase: { kind: "status", main: { text: "Indent expired", tone: "err" }, others } } });
  const render = (r: Row) => renderToStaticMarkup(createElement(DataList, { columns: cols, rows: [r] }));
  it("shows the one chip, a +N and every status in the tooltip", () => {
    const out = render(row([{ text: "Awaiting return" }, { text: "Number allocated" }]));
    expect(out).toContain("+2");
    expect(out).toContain('role="tooltip"');
    expect(out).toContain("Awaiting return");
    expect(out).toContain("Number allocated");
  });
  it("with no others there is no +N and no tooltip", () => {
    const out = render(row([]));
    expect(out).toContain("Indent expired");
    expect(out).not.toContain("+0");
    expect(out).not.toContain('role="tooltip"');
  });
});

describe("a chip's provenance tag (6.13A residual: the shared badge, never '(assumed reading)')", () => {
  const cols: Column[] = [{ key: "phase", label: "Where it stands" }];
  const row = (provenance?: "ASSUMED"): Row => ({ id: "1", search: "a", cells: { phase: { kind: "chips", items: [{ text: "Active" }, { text: "In Delay", tone: "err", ...(provenance ? { provenance } : {}) }] } } });
  const render = (r: Row) => renderToStaticMarkup(createElement(DataList, { columns: cols, rows: [r] }));
  it("a chip with provenance shows no badge (the source is recorded, read in History; plan 5.1)", () => {
    const out = render(row("ASSUMED"));
    expect(out).toContain(">In Delay<");
    expect(out).not.toContain(">Assumed<");
    expect(out).not.toContain("assumed reading");
  });
  it("without it, no badge", () => {
    expect(render(row())).not.toContain(">Assumed<");
  });
});

describe("a SULIT column withheld in every row collapses into one note (plan 6.1, FR-EVL-014)", () => {
  const cols: Column[] = [{ key: "name", label: "Name" }, { key: "price", label: "Price", numeric: true, sulit: true }];
  const row = (id: string, price: Row["cells"][string]): Row => ({ id, search: id, cells: { name: { kind: "text", text: `Bidder ${id}` }, price } });
  const hidden = (id: string) => row(id, { kind: "withheld", words: "Only the opening committee may read prices." });
  const render = (rows: Row[]) => renderToStaticMarkup(createElement(DataList, { columns: cols, rows }));

  it("drops the column and says so once, with the reason, when every row is withheld", () => {
    const out = render([hidden("1"), hidden("2")]);
    expect(withheldColumns(cols, [hidden("1"), hidden("2")]).map((c) => c.key)).toEqual(["price"]);
    expect(out).toContain("Values hidden: SULIT");
    expect(out).toContain("Only the opening committee may read prices.");
    expect(out).not.toContain(">Price<");
    expect(out).not.toContain("SULIT · withheld");
    expect(out).toContain("Bidder 1");
    expect(out.match(/<col\b/g)?.length).toBe(2);
    expect(out).toContain("Download CSV (SULIT left out)");
  });
  it("keeps the column when one row shows its value, and writes no note", () => {
    const out = render([hidden("1"), row("2", { kind: "money", value: 1500 })]);
    expect(out).toContain(">Price<");
    expect(out).not.toContain("Values hidden");
    expect(out).toContain("SULIT · withheld");
  });
  it("an empty list, and a column that is not SULIT, never collapse", () => {
    expect(withheldColumns(cols, [])).toEqual([]);
    expect(withheldColumns([{ key: "price", label: "Price" }], [hidden("1")])).toEqual([]);
  });
});
