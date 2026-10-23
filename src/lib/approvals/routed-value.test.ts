import { describe, expect, it } from "vitest";

import { ceilingValue, routedValue, UnvaluedRouteError } from "./routed-value";

describe("a route's routed value (6.15 OD-2 A)", () => {
  it("reads a valued route exactly, in sen", () => {
    expect(routedValue({ value: "275000.50" })).toBe(27_500_050n);
  });

  it("a route with no value is never read as 0", () => {
    expect(() => routedValue({ value: null })).toThrow(UnvaluedRouteError);
  });
});

describe("the figure a delegate's ceiling is judged against", () => {
  it("a valued route: its value, exactly", () => {
    expect(ceilingValue({ value: "275000.50", contractMatterId: null }, false)).toBe(27_500_050n);
  });
  it("a requisition, exercise or award route with no value is a broken invariant, never a ceiling of 0 that every delegate passes", () => {
    expect(() => ceilingValue({ value: null, contractMatterId: null }, false)).toThrow(UnvaluedRouteError);
  });
  it("a supplier matter, and a contract matter routed on its condition alone, have no value: no ceiling limits them", () => {
    expect(ceilingValue({ value: null, contractMatterId: null }, true)).toBe(0n);
    expect(ceilingValue({ value: null, contractMatterId: "m1" }, false)).toBe(0n);
    expect(ceilingValue({ value: "1000.00", contractMatterId: "m1" }, false)).toBe(100_000n);
  });
});
