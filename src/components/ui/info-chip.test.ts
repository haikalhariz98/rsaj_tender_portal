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
  it("provenance keeps its four words and their detail without a native title", () => {
    for (const [value, word, detail] of [["STATED", "Stated", "Written in a governing document"], ["OBSERVED", "Observed", "Seen in practice"], ["ASSUMED", "Assumed", "working default"], [null, "Not set", "Nobody has said"]] as const) {
      const out = renderToStaticMarkup(createElement(ProvenanceBadge, { value }));
      expect(out).toContain(word);
      expect(out).toContain(detail);
      expect(out).not.toContain("title=");
    }
  });
});
