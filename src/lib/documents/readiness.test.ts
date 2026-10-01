import { describe, expect, it } from "vitest";

import { attentionText, classReadiness, isReadyToRun } from "./readiness";

const cls = (retentionMonths: number | null, retentionTrigger: string | null, classification: string | null = "INTERNAL") => ({ retentionMonths, retentionTrigger, classification });

describe("isReadyToRun", () => {
  it("needs both a period and what starts it", () => {
    expect(isReadyToRun(cls(84, "OWNER_CLOSED"))).toBe(true);
    expect(isReadyToRun(cls(84, null))).toBe(false);
    expect(isReadyToRun(cls(null, "OWNER_CLOSED"))).toBe(false);
  });
  it("does not take zero months for a period", () => {
    expect(isReadyToRun(cls(0, "OWNER_CLOSED"))).toBe(false);
  });
});

describe("classReadiness", () => {
  const demo = [cls(84, "CONTRACT_FINAL_ACCOUNT"), cls(84, null), cls(null, null, null)];
  it("counts a class ready only when period and start are set", () => {
    expect(classReadiness(demo)).toMatchObject({ ready: 1, total: 3 });
  });
  it("lists every class with a gap, an unset classification included", () => {
    expect(classReadiness(demo).needAttention).toHaveLength(2);
    expect(classReadiness([cls(84, "RECEIVED", null)]).needAttention).toHaveLength(1);
  });
});

describe("attentionText", () => {
  it("is plural, singular, or absent", () => {
    expect(attentionText(2)).toBe("2 classes need attention");
    expect(attentionText(1)).toBe("1 class needs attention");
    expect(attentionText(0)).toBeNull();
  });
});
