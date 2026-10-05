import { describe, expect, it } from "vitest";

import { DETAILS_FAULT_TEXT, detailsFault, workCodeOf } from "./details";
import { EXERCISE_STATUSES } from "./types";

describe("an exercise's person in charge and work code (founder, 2026-10-05)", () => {
  it("may change in every state but cancelled, while no award has gone for approval", () => {
    for (const status of EXERCISE_STATUSES) {
      expect(detailsFault({ status, classificationLockedAt: null })).toBe(status === "CANCELLED" ? "CANCELLED" : null);
    }
  });
  it("is kept as it was once an award has locked the classification", () => {
    expect(detailsFault({ status: "EVALUATED", classificationLockedAt: new Date("2026-10-01T00:00:00Z") })).toBe("AWARDED");
    // Cancelled reads first: it is the plainer reason.
    expect(detailsFault({ status: "CANCELLED", classificationLockedAt: new Date("2026-10-01T00:00:00Z") })).toBe("CANCELLED");
  });
  it("says each refusal in words", () => {
    for (const text of Object.values(DETAILS_FAULT_TEXT)) expect(text).toMatch(/^Not saved: /);
  });
  it("holds a blank work code as not recorded, and trims one given", () => {
    expect(workCodeOf("")).toBeNull();
    expect(workCodeOf("   ")).toBeNull();
    expect(workCodeOf("  CE21 ")).toBe("CE21");
  });
});
