import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Accordion } from "./accordion";

/**
 * Phase 2 close-out residual 6a (lead's ruling; flagged against the shared components): the
 * Accordion's title wrapped nowhere and truncated with a hover-only tooltip, so at 390 the approval
 * matrix's "Change to the invitation window" read cut off on a phone. It now wraps at every width;
 * its two users (the approval matrix's rule groups and the document drawer) show the whole title.
 */

describe("the Accordion title shows in full", () => {
  it("wraps, never truncates, and keeps its words", () => {
    const props: Parameters<typeof Accordion>[0] = { title: "Change to the invitation window", meta: "3 rules", children: null };
    const html = renderToStaticMarkup(createElement(Accordion, props));
    expect(html).toContain("Change to the invitation window");
    expect(html).toMatch(/class="[^"]*\bbreak-words\b[^"]*"/);
    expect(html).not.toMatch(/\btruncate\b/);
  });
});
