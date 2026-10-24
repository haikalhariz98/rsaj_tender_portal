import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StatusCounts } from "./status-counts";

const render = (items: Parameters<typeof StatusCounts>[0]["items"]) => renderToStaticMarkup(createElement(StatusCounts, { items, label: "Where requisitions stand" }));

describe("StatusCounts (plan 6.1)", () => {
  it("shows each status with its count as a link to the filtered view, and leaves zeros out", () => {
    const out = render([
      { label: "Awaiting you", count: 3, href: "?view=mine", tone: "warn" },
      { label: "Sent back", count: 0, href: "?view=back" },
      { label: "Approved", count: 12, href: "?view=ok", tone: "ok", active: true },
    ]);
    expect(out).toContain('href="?view=mine"');
    expect(out).toMatch(/>3<\/span>Awaiting you/);
    expect(out).toContain("12");
    expect(out).not.toContain("Sent back");
    expect(out).toContain('aria-current="true"');
    expect(out).toContain('aria-label="Where requisitions stand"');
  });
  it("draws nothing at all when every count is zero", () => {
    expect(render([{ label: "Sent back", count: 0, href: "?x" }])).toBe("");
  });
  it("keeps the view being shown at zero, so a reader on an empty view sees where they are", () => {
    const out = render([{ label: "Open", count: 4, href: "?x" }, { label: "Drafts", count: 0, href: "?view=drafts", active: true }, { label: "Sent back", count: 0, href: "?view=back" }]);
    expect(out).toContain("Drafts");
    expect(out).not.toContain("Sent back");
  });
  it("an uncounted status (security review L7) stays in the row with a dash and its reason, never a number it does not have", () => {
    const out = render([{ label: "Open for purchase", count: 0, href: "?view=open", uncounted: "Too many to judge." }]);
    expect(out).toMatch(/>—<\/span>Open for purchase/);
    expect(out).toContain('title="Too many to judge."');
  });
});
