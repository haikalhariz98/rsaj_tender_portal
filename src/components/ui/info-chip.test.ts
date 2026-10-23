import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { InfoChip } from "./info-chip";
import { ProvenanceBadge } from "./provenance";

// Note 0005, founder 2026-10-19: a chip's detail is in a popover reachable by keyboard, never a native title.
describe("a chip with detail", () => {
  it("shows the word, carries the detail for a screen reader and offers the information button", () => {
    const out = renderToStaticMarkup(createElement(InfoChip, { detail: "No second step is built." }, "Password only"));
    expect(out).toContain("Password only");
    expect(out).toContain('<span class="sr-only">No second step is built.</span>');
    expect(out).toContain("<button");
    expect(out).not.toContain("title=");
  });
  it("provenance shows no chip on a working screen, but a gap stays visible as plain text (SP-18)", () => {
    for (const value of ["STATED", "OBSERVED", "ASSUMED"]) expect(renderToStaticMarkup(createElement(ProvenanceBadge, { value })), value).toBe("");
    for (const value of [null, undefined]) {
      const out = renderToStaticMarkup(createElement(ProvenanceBadge, { value }));
      expect(out).toContain("Not set");
      expect(out).not.toContain("<button");
    }
  });
});
