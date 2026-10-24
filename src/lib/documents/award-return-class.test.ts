import { describe, expect, it } from "vitest";

import { AWARD_RETURN_CLASS_NOT_OURS, AWARD_RETURN_CLASS_NOT_SULIT, awardReturnClassFault, eligibleAwardReturnClasses } from "./award-return-class";

describe("the class for returned award documents (ADR 0045 D1, WV-5)", () => {
  it("refuses a class that is not the organisation's, an unclassified one, an INTERNAL one and a PUBLIC one", () => {
    expect(awardReturnClassFault(null)).toBe(AWARD_RETURN_CLASS_NOT_OURS);
    expect(awardReturnClassFault({ classification: null })).toBe(AWARD_RETURN_CLASS_NOT_SULIT);
    expect(awardReturnClassFault({ classification: "INTERNAL" })).toBe(AWARD_RETURN_CLASS_NOT_SULIT);
    expect(awardReturnClassFault({ classification: "PUBLIC" })).toBe(AWARD_RETURN_CLASS_NOT_SULIT);
    expect(AWARD_RETURN_CLASS_NOT_SULIT).toMatch(/identity card number/);
  });

  it("accepts a SULIT class", () => {
    expect(awardReturnClassFault({ classification: "SULIT" })).toBeNull();
  });

  it("offers only SULIT classes, in order", () => {
    const rows = [{ id: "a", classification: null }, { id: "b", classification: "SULIT" as const }, { id: "c", classification: "INTERNAL" as const }, { id: "d", classification: "SULIT" as const }];
    expect(eligibleAwardReturnClasses(rows).map((r) => r.id)).toEqual(["b", "d"]);
  });
});
