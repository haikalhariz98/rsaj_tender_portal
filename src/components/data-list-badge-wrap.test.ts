import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DataList, type Row } from "./data-list";

/**
 * 6.12 review S-2 (flagged against the shared DataList): a status badge held on one line from md up ran
 * over the next column when it was wider than its own ("Awaiting conditions precedent" over /projects'
 * Dates at 1280 and 1440). The badge cell now uses the Badge's own wrapping: one line where the column
 * holds it, a second line inside the column where it does not, never past its edge. Every list with a
 * badge column takes it.
 */

const rows: Row[] = [{ id: "1", search: "x", cells: { name: { kind: "text", text: "Rangkaian paip" }, phase: { kind: "badge", text: "Awaiting conditions precedent", tone: "warn" } } }];
const html = renderToStaticMarkup(createElement(DataList, { columns: [{ key: "name", label: "Contract", mobile: "primary" }, { key: "phase", label: "Where it stands", width: "200px", mobile: "meta" }], rows, selectable: false }));

describe("a status badge in a list", () => {
  const badges = [...html.matchAll(/<span[^>]*title="Awaiting conditions precedent"[^>]*>/g)].map((m) => m[0]);
  it("is rendered in both layouts, whole", () => {
    expect(badges.length).toBeGreaterThanOrEqual(2);
    expect(html.match(/Awaiting conditions precedent<\/span>/g)!.length).toBeGreaterThanOrEqual(2);
  });
  it("wraps inside its column instead of holding one line past it", () => {
    for (const b of badges) {
      expect(b).not.toMatch(/whitespace-nowrap/);
      expect(b).toMatch(/break-words/);
      expect(b).toMatch(/max-w-full/);
    }
  });
});
