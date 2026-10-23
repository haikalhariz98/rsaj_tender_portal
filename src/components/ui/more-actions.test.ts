import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MoreActions, MoreItem } from "./more-actions";

describe("MoreActions (plan 6.1)", () => {
  const out = renderToStaticMarkup(
    createElement(MoreActions, null, createElement(MoreItem, { href: "/x" } as never, "Print"), createElement(MoreItem, { danger: true } as never, "Cancel requisition")),
  );
  it("is a details menu whose button is named, with its items inside", () => {
    expect(out).toMatch(/^<details/);
    expect(out).toContain('<summary aria-label="More actions"');
    expect(out).toContain('href="/x"');
    expect(out).toContain("Cancel requisition");
  });
  it("marks a destructive item in rose and never as a submit button by default", () => {
    expect(out).toMatch(/<button type="button"[^>]*text-rose-700[^>]*>[^]*Cancel requisition/);
  });
});
