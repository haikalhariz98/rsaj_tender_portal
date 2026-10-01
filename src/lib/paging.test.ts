import { describe, expect, it } from "vitest";

import { needsPaging, PAGE_SIZES } from "./paging";

describe("needsPaging", () => {
  it("is false while every row fits on the smallest page", () => {
    expect(needsPaging(0)).toBe(false);
    expect(needsPaging(1)).toBe(false);
    expect(needsPaging(PAGE_SIZES[0])).toBe(false);
  });
  it("is true one row past the smallest page", () => {
    expect(needsPaging(PAGE_SIZES[0] + 1)).toBe(true);
    expect(needsPaging(300)).toBe(true);
  });
});
