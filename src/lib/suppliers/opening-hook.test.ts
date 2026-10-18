import { describe, expect, it } from "vitest";

import { registerStandingOf } from "./opening-hook";

/// AC-44: the register's standing as the frozen eligibility reading held it, as a label.
const finding = (standing: string) => ({ judgedOn: "2026-10-01", supplierId: "s1", supplierReference: "SUP-1", standing, verdict: "ELIGIBLE", rows: [] });

describe("registerStandingOf", () => {
  it("reads the frozen standing as a label, never a code", () => {
    expect(registerStandingOf(finding("ACTIVE"))).toBe("Active");
    expect(registerStandingOf(finding("BLACKLISTED"))).toBe("Blacklisted");
  });
  it("is null when the bidder was not linked, or the standing has no label", () => {
    expect(registerStandingOf(null)).toBeNull();
    expect(registerStandingOf(finding("SOMETHING_NEW"))).toBeNull();
  });
});
