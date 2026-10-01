import { describe, expect, it } from "vitest";

import { icNumberFault, maskIc } from "./mask";

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

describe("the IC number's shape", () => {
  it("is twelve digits, the hyphens optional", () => {
    expect(icNumberFault("900101-14-5678")).toBeNull();
    expect(icNumberFault("900101145678")).toBeNull();
    expect(icNumberFault("")).toBeNull();
    expect(icNumberFault("abc")).toBe("FORMAT");
    expect(icNumberFault("900101-14-567")).toBe("FORMAT");
  });
  it("a malformed number masks to the same fixed length, showing no letters", () => {
    expect(maskIc("abc")).toBe("••••••••••••");
    expect(maskIc("12")).toBe("••••••••••12");
    expect(maskIc("abc")).toHaveLength(maskIc("900101-14-5678").length);
  });
});
