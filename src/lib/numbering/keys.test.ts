import { describe, expect, it } from "vitest";
import { KNOWN_SERIES, seriesKeyOptions } from "./keys";

describe("seriesKeyOptions", () => {
  it("offers the keys the issuer reads, including the ones the old list blocked", () => {
    const values = seriesKeyOptions([]).map((o) => o.value);
    expect(values).toEqual(expect.arrayContaining(["direct_appointment", "supplier", "meeting"]));
  });
  it("leaves out a key that already has a series", () => {
    expect(seriesKeyOptions(["contract"]).some((o) => o.value === "contract")).toBe(false);
  });
  it("has unique keys and a name for each", () => {
    expect(new Set(KNOWN_SERIES.map((s) => s.key)).size).toBe(KNOWN_SERIES.length);
    expect(KNOWN_SERIES.every((s) => s.label.length > 0 && !s.label.includes("_"))).toBe(true);
  });
});
