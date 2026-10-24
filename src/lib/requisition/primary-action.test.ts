import { describe, expect, it } from "vitest";

import { headerMenu, primaryAction, type MenuFacts, type PrimaryFacts } from "./primary-action";

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
  it("while approval is pending: the approver approves, the originator recalls, anyone else (a bystander) gets no primary action; a committee step offers no approve", () => {
    const step = { committee: false };
    expect(of({ status: "PENDING_APPROVAL", step, viewerDecides: true, viewerMayRecall: true })).toBe("approve");
    expect(of({ status: "PENDING_APPROVAL", step, viewerMayRecall: true })).toBe("recall");
    expect(of({ status: "PENDING_APPROVAL", step })).toBeNull();
    expect(of({ status: "PENDING_APPROVAL", step: { committee: true } })).toBeNull();
    expect(of({ status: "PENDING_APPROVAL", step: { committee: true }, viewerMayRecall: true })).toBe("recall");
  });
  it("a bystander is never offered a decision as primary: neither the step's approver nor the originator (review B1)", () => {
    for (const committee of [false, true]) expect(of({ status: "PENDING_APPROVAL", step: { committee }, viewerDecides: false, viewerMayRecall: false })).toBeNull();
    // The originator whose recall is refused (a step is already done) gets nothing either, not a disabled Recall.
    expect(of({ status: "PENDING_APPROVAL", step: { committee: false }, viewerMayRecall: false })).toBeNull();
  });
  it("is at most one action for every status and viewer", () => {
    const statuses = ["DRAFT", "ENDORSED", "RETURNED", "REGISTERED", "BUDGET_CHECKED", "OVER_BUDGET", "PENDING_APPROVAL", "REJECTED", "RECALLED", "APPROVED", "SOURCING", "PARTIALLY_FULFILLED", "FULFILLED", "CANCELLED", "CLOSED"];
    for (const status of statuses) for (const viewerDecides of [true, false]) for (const viewerMayRecall of [true, false]) {
      const r = of({ status, step: { committee: false }, viewerDecides, viewerMayRecall });
      expect(r === null || typeof r === "string").toBe(true);
    }
  });
});

describe("the header menu by viewer (review B1)", () => {
  const f: MenuFacts = { kind: null, plainStep: true, viewerMayRecordForOthers: false, paperSignaturesAllowed: true, viewerRaisedIt: false, viewerIsOriginator: false, recallUsable: false };
  const menu = (o: Partial<MenuFacts>) => headerMenu({ ...f, ...o });
  it("the step's approver is offered neither: they approve", () => {
    expect(menu({ kind: "approve", viewerMayRecordForOthers: true })).toEqual({ record: false, recall: false });
  });
  it("an originator whose recall is usable recalls (primary) and sees no paper decision; one whose recall is refused sees no Recall at all", () => {
    expect(menu({ kind: "recall", viewerIsOriginator: true, recallUsable: true })).toEqual({ record: false, recall: false });
    expect(menu({ kind: null, viewerIsOriginator: true, viewerRaisedIt: true, recallUsable: false })).toEqual({ record: false, recall: false });
  });
  it("a bystander is offered a paper decision only with the permission, with paper signatures allowed, and not if they raised it", () => {
    expect(menu({})).toEqual({ record: false, recall: false });
    expect(menu({ viewerMayRecordForOthers: true })).toEqual({ record: true, recall: false });
    expect(menu({ viewerMayRecordForOthers: true, paperSignaturesAllowed: false }).record).toBe(false);
    expect(menu({ viewerMayRecordForOthers: true, viewerRaisedIt: true }).record).toBe(false);
  });
  it("a committee step has nothing to record by hand", () => {
    expect(menu({ plainStep: false, viewerMayRecordForOthers: true }).record).toBe(false);
  });
});
