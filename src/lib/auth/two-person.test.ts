import { describe, expect, it } from "vitest";

import { ConfigurationChangeKind } from "@/generated/prisma/enums";

import { ALWAYS_TWO_PERSON, appliesAtOnce, SWITCH_KINDS } from "./two-person";

const ALL = Object.values(ConfigurationChangeKind);
const RECORDS = ["BASELINE_CORRECTION", "AWARD_TERM_CORRECTION", "CONTRACT_DATE_CORRECTION", "AWARD_RETURN_CORRECTION", "CLASSIFICATION_DOWNGRADE"];

describe("the two-person switch (ADR 0043 D3)", () => {
  it("classifies every kind once, and never covers the five record kinds", () => {
    expect([...SWITCH_KINDS, ...ALWAYS_TWO_PERSON].sort()).toEqual([...ALL].sort());
    expect([...ALWAYS_TWO_PERSON].sort()).toEqual([...RECORDS].sort());
  });

  it("applies a covered kind at once only while the switch is off; a record kind never", () => {
    for (const kind of ALL) {
      expect(appliesAtOnce(kind, true), kind).toBe(false);
      expect(appliesAtOnce(kind, false), kind).toBe(!RECORDS.includes(kind));
    }
  });
});
