import { describe, expect, it } from "vitest";

import { maskIc } from "./mask";

describe("masking the IC number", () => {
  it("keeps the last four digits only", () => {
    expect(maskIc("900101-01-1234")).toBe("••••••••1234");
    expect(maskIc("900101011234")).toBe("••••••••1234");
  });
  it("an empty number stays empty", () => {
    expect(maskIc("")).toBe("");
    expect(maskIc(null)).toBe("");
  });
  it("never contains the leading digits", () => {
    expect(maskIc("900101-01-1234")).not.toContain("9001");
  });
});
