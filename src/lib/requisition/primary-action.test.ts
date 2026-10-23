import { describe, expect, it } from "vitest";

import { primaryAction, type PrimaryFacts } from "./primary-action";

const base: PrimaryFacts = { status: "DRAFT", step: null, viewerDecides: false, viewerMayRecall: false, budgetCheckNeeded: false, awaitingChoice: false, canSource: false, liveExercises: 0 };
const of = (o: Partial<PrimaryFacts>) => primaryAction({ ...base, ...o });

describe("a requisition's one primary action (plan 6.3)", () => {
  it("follows the status", () => {
    expect(of({ status: "DRAFT" })).toBe("endorse");
    expect(of({ status: "ENDORSED", budgetCheckNeeded: true })).toBe("check");
    expect(of({ status: "BUDGET_CHECKED" })).toBe("submit");
    expect(of({ status: "RETURNED" })).toBe("reopen");
    expect(of({ status: "RECALLED" })).toBe("reopen");
    expect(of({ status: "REJECTED", awaitingChoice: true })).toBe("choose");
    expect(of({ status: "REJECTED" })).toBeNull();
    expect(of({ status: "APPROVED", canSource: true })).toBe("source");
    expect(of({ status: "APPROVED" })).toBeNull();
    expect(of({ status: "SOURCING", liveExercises: 1 })).toBe("exercise");
    expect(of({ status: "CANCELLED" })).toBeNull();
    expect(of({ status: "CLOSED", canSource: true })).toBeNull();
  });
  it("while approval is pending: the approver approves, the originator recalls, anyone else records; a committee step offers neither", () => {
    const step = { committee: false };
    expect(of({ status: "PENDING_APPROVAL", step, viewerDecides: true, viewerMayRecall: true })).toBe("approve");
    expect(of({ status: "PENDING_APPROVAL", step, viewerMayRecall: true })).toBe("recall");
    expect(of({ status: "PENDING_APPROVAL", step })).toBe("record");
    expect(of({ status: "PENDING_APPROVAL", step: { committee: true } })).toBeNull();
    expect(of({ status: "PENDING_APPROVAL", step: { committee: true }, viewerMayRecall: true })).toBe("recall");
  });
  it("is at most one action for every status and viewer", () => {
    const statuses = ["DRAFT", "ENDORSED", "RETURNED", "REGISTERED", "BUDGET_CHECKED", "OVER_BUDGET", "PENDING_APPROVAL", "REJECTED", "RECALLED", "APPROVED", "SOURCING", "PARTIALLY_FULFILLED", "FULFILLED", "CANCELLED", "CLOSED"];
    for (const status of statuses) for (const viewerDecides of [true, false]) for (const viewerMayRecall of [true, false]) {
      const r = of({ status, step: { committee: false }, viewerDecides, viewerMayRecall });
      expect(r === null || typeof r === "string").toBe(true);
    }
  });
});
