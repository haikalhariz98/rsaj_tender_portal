import { describe, expect, it } from "vitest";

import { routedValue, UnvaluedRouteError } from "./routed-value";

describe("a route's routed value (6.15 OD-2 A)", () => {
  it("reads a valued route exactly, in sen", () => {
    expect(routedValue({ value: "275000.50" })).toBe(27_500_050n);
  });

  it("a route with no value is never read as 0", () => {
    expect(() => routedValue({ value: null })).toThrow(UnvaluedRouteError);
  });
});
