import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Meter } from "./feedback";

/// N3 reviewer run 1, AC-63: a bar alone says nothing to a screen reader, so Meter is a meter with its range and an optional name.
describe("Meter is announced as a meter", () => {
  it("carries role, range, a clamped value and the caller's name", () => {
    const html = renderToStaticMarkup(createElement(Meter, { percent: 140, label: "Budget used" }));
    expect(html).toContain('role="meter"');
    expect(html).toContain('aria-valuemin="0"');
    expect(html).toContain('aria-valuemax="100"');
    expect(html).toContain('aria-valuenow="100"');
    expect(html).toContain('aria-label="Budget used"');
  });
  it("rounds the value it announces", () => {
    expect(renderToStaticMarkup(createElement(Meter, { percent: 42.4 }))).toContain('aria-valuenow="42"');
  });
});
