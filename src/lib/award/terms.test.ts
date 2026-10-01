import { describe, expect, it } from "vitest";

import { termsUpdate } from "./terms";

describe("saving the award's terms", () => {
  it("writes only what the form carried: retention and defects liability not on the form keep their stored values", () => {
    const present = new Set(["startDate", "ladAmount", "ladUnit"]);
    const w = termsUpdate(present, { startDate: "2026-11-01", ladAmount: "500.00", ladUnit: "per day", retentionPercent: null, dlpMonths: null });
    expect(w).toEqual({ startDate: "2026-11-01", ladAmount: "500.00", ladUnit: "per day" });
    expect("dlpMonths" in w).toBe(false);
    expect("retentionPercent" in w).toBe(false);
  });
  it("a field the form carried empty is cleared — that is the officer's act", () => {
    expect(termsUpdate(new Set(["dlpMonths"]), { dlpMonths: null })).toEqual({ dlpMonths: null });
  });
  it("answering 'no bond' clears the bond's detail; 'a bond' clears the reason", () => {
    const no = termsUpdate(new Set(["bondRequired", "bondNotRequiredReason"]), { bondRequired: false, bondNotRequiredReason: "Supply only" });
    expect(no).toEqual({ bondRequired: false, bondNotRequiredReason: "Supply only", bondBasis: null, bondPercent: null, bondBasisAmount: null, bondValidityExtraMonths: null });
    const yes = termsUpdate(new Set(["bondRequired", "bondBasis", "bondPercent", "bondBasisAmount"]), { bondRequired: true, bondBasis: "CONTRACT_PRICE", bondPercent: "5", bondBasisAmount: "100.00" });
    expect(yes).toEqual({ bondRequired: true, bondBasis: "CONTRACT_PRICE", bondPercent: "5", bondBasisAmount: null, bondNotRequiredReason: "" });
  });
  it("a save without the bond question leaves the whole bond as stored", () => {
    expect(termsUpdate(new Set(["startDate"]), { startDate: null, bondRequired: null, bondBasis: null })).toEqual({ startDate: null });
  });
});
