import { describe, expect, it } from "vitest";

import { manualVendorMaster } from "./vendor-master";

describe("the manual vendor-master adapter (INT-03)", () => {
  const ctx = { pattern: "V\\d{6}", taken: false, registered: true };
  it("accepts a code in the configured format for a registered supplier", () => {
    expect(manualVendorMaster.check("V000123", ctx)).toEqual([]);
  });
  it("refuses a code in another format, one already used, and any code before registration", () => {
    expect(manualVendorMaster.check("123", { ...ctx, taken: true, registered: false })).toEqual(["NOT_REGISTERED", "FORMAT", "TAKEN"]);
  });
  it("with no format set, the code is not checked against one", () => {
    expect(manualVendorMaster.check("anything", { ...ctx, pattern: null })).toEqual([]);
    expect(manualVendorMaster.check(" ", ctx)).toEqual(["CODE_REQUIRED"]);
  });
});
