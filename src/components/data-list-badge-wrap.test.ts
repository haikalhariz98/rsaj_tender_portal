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

/** Phase 0.2 item 1: a status chip wider than its column ("Approved, not in the finance system" in a 250px Status column) was cut with an ellipsis. It now wraps inside the column, as the badge does; a chip marked `nowrap` keeps one line. */
describe("a status chip in a list", () => {
  const chipRows: Row[] = [{ id: "1", search: "x", cells: { name: { kind: "text", text: "Rekaan" }, where: { kind: "chips", items: [{ text: "Approved, not in the finance system", tone: "warn" }, { text: "Waiting for you", tone: "brand", nowrap: true }] } } }];
  const out = renderToStaticMarkup(createElement(DataList, { columns: [{ key: "name", label: "Supplier", mobile: "primary" }, { key: "where", label: "Status", width: "250px", mobile: "meta" }], rows: chipRows, selectable: false }));
  it("wraps rather than truncating, unless it asks for one line", () => {
    const wrapped = [...out.matchAll(/title="Approved, not in the finance system"[^>]*>\s*<span class="([^"]*)"/g)].map((m) => m[1]);
    expect(wrapped.length).toBeGreaterThanOrEqual(1);
    for (const c of wrapped) expect(c).not.toMatch(/\btruncate\b/);
    const kept = [...out.matchAll(/title="Waiting for you"[^>]*>\s*<span class="([^"]*)"/g)].map((m) => m[1]);
    for (const c of kept) expect(c).toMatch(/\btruncate\b/);
  });
});
