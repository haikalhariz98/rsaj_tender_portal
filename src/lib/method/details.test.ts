import { describe, expect, it } from "vitest";

import { personInChargeTrail, DETAILS_FAULT_TEXT, DETAILS_LOCKED_TEXT, detailsFault, workCodeOf } from "./details";
import { EXERCISE_STATUSES } from "./types";

describe("an exercise's person in charge and work code (founder, 2026-10-05)", () => {
  it("may change in every state but cancelled, while no award has gone for approval", () => {
    for (const status of EXERCISE_STATUSES) {
      expect(detailsFault({ status, awards: [] })).toBe(status === "CANCELLED" ? "CANCELLED" : null);
    }
  });
  it("is kept as it was once an award has locked the classification", () => {
    expect(detailsFault({ status: "EVALUATED", awards: [{ status: "PENDING_APPROVAL" }] })).toBe("AWARDED");
    // Cancelled reads first: it is the plainer reason.
    expect(detailsFault({ status: "CANCELLED", awards: [{ status: "PENDING_APPROVAL" }] })).toBe("CANCELLED");
  });
  it("opens again when the award that locked it is cancelled, and a draft award does not lock it", () => {
    expect(detailsFault({ status: "EVALUATED", awards: [{ status: "CANCELLED" }] })).toBeNull();
    expect(detailsFault({ status: "EVALUATED", awards: [{ status: "CANCELLED" }, { status: "DRAFT" }] })).toBeNull();
    expect(detailsFault({ status: "EVALUATED", awards: [{ status: "CANCELLED" }, { status: "ISSUED" }] })).toBe("AWARDED");
  });
  it("says what is fixed on the screen without claiming a save was tried", () => {
    for (const text of Object.values(DETAILS_LOCKED_TEXT)) expect(text).toMatch(/^Fixed: /);
  });
  it("says each refusal in words", () => {
    for (const text of Object.values(DETAILS_FAULT_TEXT)) expect(text).toMatch(/^Not saved: /);
  });
  it("records a change between two people of the same name so that it does not diff to nothing", () => {
    const a = { id: "p1", name: "Ahmad bin Ali" };
    const b = { id: "p2", name: "Ahmad bin Ali" };
    const t = personInChargeTrail(a, b);
    expect(t.before).toBe("Ahmad bin Ali");
    expect(t.after).not.toBe(t.before);
    expect(personInChargeTrail(a, a)).toEqual({ before: "Ahmad bin Ali", after: "Ahmad bin Ali" });
    expect(personInChargeTrail(null, a)).toEqual({ before: null, after: "Ahmad bin Ali" });
    expect(personInChargeTrail(a, null)).toEqual({ before: "Ahmad bin Ali", after: null });
  });
  it("holds a blank work code as not recorded, and trims one given", () => {
    expect(workCodeOf("")).toBeNull();
    expect(workCodeOf("   ")).toBeNull();
    expect(workCodeOf("  CE21 ")).toBe("CE21");
  });
});
