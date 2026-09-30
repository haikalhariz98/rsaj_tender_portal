import { describe, expect, it } from "vitest";

import { determinationDrift } from "./drift";
import { findingText } from "./labels";

const stored = { contractTypeCode: "works", contractTypeState: "DERIVED", regime: "quotation", appointmentRuleKey: "q", termsBandKey: "t", boundaryOperator: "GT", restricted: false, proposedMethodCode: "open" };

describe("a classification that changed since the last save (review #2)", () => {
  it("passes when nothing re-derived differs", () => {
    expect(determinationDrift(stored, { ...stored })).toEqual([]);
  });
  it("refuses the move, listing what changed and asking for a re-save", () => {
    const f = determinationDrift(stored, { ...stored, termsBandKey: "other", contractTypeCode: "supply" });
    expect(f[0].level).toBe("block");
    const text = findingText(f[0]);
    expect(text).toMatch(/the contract type, the contract terms band/);
    expect(text).toMatch(/Edit/);
  });
  it("treats unset and missing alike", () => {
    expect(determinationDrift({ ...stored, termsBandKey: null }, { ...stored, termsBandKey: undefined })).toEqual([]);
  });
});
