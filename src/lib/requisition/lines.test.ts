import { describe, expect, it } from "vitest";

import { lineAmount } from "./lines";

describe("a line's amount from quantity × unit price (UX review, M7)", () => {
  it("multiplies exactly in sen", () => {
    expect(lineAmount("3", "1250.50")).toBe(375150n);
    expect(lineAmount("1,000", "0.10")).toBe(10000n);
    // 0.1 × 3 in floats is 0.30000000000000004; in sen it is 30.
    expect(lineAmount("3", "0.10")).toBe(30n);
  });
  it("takes a quantity to three decimals and rounds half up to the sen", () => {
    expect(lineAmount("2.5", "10.01")).toBe(2503n); // 25.025 → 25.03
    expect(lineAmount("0.125", "1.00")).toBe(13n); // 0.125 → 0.13
  });
  it("gives nothing unless both are figures", () => {
    expect(lineAmount("", "10")).toBeNull();
    expect(lineAmount("2", "")).toBeNull();
    expect(lineAmount("two", "10")).toBeNull();
    expect(lineAmount("1.2345", "10")).toBeNull();
    expect(lineAmount("2", "10.005")).toBeNull();
    expect(lineAmount("2", "-5")).toBeNull();
  });
});
