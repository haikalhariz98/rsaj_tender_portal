import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Meter } from "./feedback";

/// N3 reviewer run 1 and its review, AC-63: a named meter is a meter with its true figure. An overspent code announces 140%, never a clamped 100.
describe("Meter is announced truthfully", () => {
  it("a named meter carries role, range, the true value and its text", () => {
    const html = renderToStaticMarkup(createElement(Meter, { percent: 140, label: "Budget used" }));
    expect(html).toContain('role="meter"');
    expect(html).toContain('aria-valuemin="0"');
    expect(html).toContain('aria-valuemax="140"');
    expect(html).toContain('aria-valuenow="140"');
    expect(html).toContain('aria-valuetext="140%"');
    expect(html).toContain('aria-label="Budget used"');
  });
  it("keeps 100 as the top of the range when within budget, and rounds", () => {
    const html = renderToStaticMarkup(createElement(Meter, { percent: 42.4, label: "Used" }));
    expect(html).toContain('aria-valuemax="100"');
    expect(html).toContain('aria-valuenow="42"');
  });
  it("an unnamed meter has no role (it would be unnamed) and its bar is hidden; the visible figure stays", () => {
    const html = renderToStaticMarkup(createElement(Meter, { percent: 140 }));
    expect(html).not.toContain('role="meter"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("140%");
  });
});
