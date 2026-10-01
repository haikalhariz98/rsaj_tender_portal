import { describe, expect, it } from "vitest";

import { scrollFor } from "./strip-scroll";

const base = { scrollLeft: 0, scrollWidth: 1000, width: 900, fade: 44 };

describe("scrolling a tab strip to a tab", () => {
  it("leaves the strip alone for a tab that is in view, so the first tabs are not cut in half", () => {
    expect(scrollFor({ ...base, itemLeft: 500, itemRight: 600 })).toBeNull();
    expect(scrollFor({ ...base, itemLeft: 10, itemRight: 90 })).toBeNull();
  });
  it("brings in a tab past the right edge, with room for the fade, never beyond the end", () => {
    expect(scrollFor({ ...base, itemLeft: 880, itemRight: 980 })).toBe(100);
    expect(scrollFor({ ...base, itemLeft: 880, itemRight: 1100 })).toBe(100);
  });
  it("brings a tab back that is scrolled past the left edge", () => {
    expect(scrollFor({ ...base, scrollLeft: 100, itemLeft: -60, itemRight: 20 })).toBe(0);
    expect(scrollFor({ ...base, scrollLeft: 100, itemLeft: 10, itemRight: 90 })).toBe(66);
  });
});
