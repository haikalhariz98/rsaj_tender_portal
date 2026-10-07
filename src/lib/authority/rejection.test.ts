import { describe, expect, it } from "vitest";

import { appliedText, CHOICE_FAULT_TEXT, ifRejectedText } from "./rejection-labels";
import {
  choiceFault,
  choicesFor,
  destinationFor,
  destinationRowFaults,
  rejectionOutcome,
  rejectionSnapshot,
  REJECTION_KINDS,
  returnTargetBefore,
  returnTargetBeforeNext,
  successorSteps,
  type DecidedStep,
  type DestinationRow,
} from "./rejection";

// Invented offices on the shape of the requisition chain (FR-REQ-009): the destination
// is the customer's policy, never shipped.
const HOD = "HOD";
const HODIV = "HODIV";
const FD = "FD";
const CEO = "CEO";
const ALL = REJECTION_KINDS;
const on = new Date("2026-10-01T00:00:00Z");
const row = (r: Partial<DestinationRow>): DestinationRow => ({
  id: "d1",
  domain: "requisition",
  kind: "RETURN_TO_STEP",
  returnToRoleCode: HODIV,
  provenance: "ASSUMED",
  effectiveFrom: new Date("2026-01-01T00:00:00Z"),
  effectiveTo: null,
  ...r,
});

/// RM300,001.00: Head of Department P → Head of Division R → Functional Director MR → CEO A.
const above300k = [
  { sequence: 1, roleCode: HOD },
  { sequence: 2, roleCode: HODIV },
  { sequence: 3, roleCode: FD },
  { sequence: 4, roleCode: CEO },
];
/// RM49,999.00: Head of Department R → Head of Division A.
const below50k = [
  { sequence: 1, roleCode: HOD },
  { sequence: 2, roleCode: HODIV },
];

describe("the destination in force (destinationFor) and the snapshot at open (CO-4)", () => {
  it("is unset where nothing is configured — destinations ship empty", () => {
    expect(destinationFor([], "requisition", on)).toEqual({ set: false });
    expect(rejectionSnapshot([], "requisition", on, on)).toMatchObject({ rejectionSnapshotAt: on, rejectionKind: null, rejectionDestinationId: null });
  });
  it("reads the row in force for the matter type on the day", () => {
    const rows = [row({ id: "old", kind: "TERMINATE", returnToRoleCode: null, effectiveTo: new Date("2026-06-01T00:00:00Z") }), row({ id: "new", effectiveFrom: new Date("2026-06-01T00:00:00Z") }), row({ id: "other", domain: "appointment" })];
    expect(destinationFor(rows, "requisition", new Date("2026-03-01T00:00:00Z"))).toMatchObject({ set: true, row: { id: "old" } });
    expect(destinationFor(rows, "requisition", on)).toMatchObject({ set: true, row: { id: "new" } });
  });
});

describe("where a rejected matter goes (rejectionOutcome)", () => {
  const snapshot = { snapshotAt: on, kind: "RETURN_TO_STEP" as const, returnToRoleCode: HODIV };

  it("worked example (FR-REQ-009): RM300,001.00, the CEO rejects, the destination returns it to the Head of Division's step", () => {
    const out = rejectionOutcome({ snapshot, committee: null, steps: above300k, rejectingSeq: 4, supports: ALL });
    expect(out).toEqual({ apply: "RETURN_TO_STEP", source: "CONFIGURED", returnToSeq: 2 });
  });

  it("worked example: RM49,999.00 with a return to the Functional Director — not on this route, so the officer chooses", () => {
    const out = rejectionOutcome({ snapshot: { ...snapshot, returnToRoleCode: FD }, committee: null, steps: below50k, rejectingSeq: 2, supports: ALL });
    expect(out).toEqual({ choose: ["RETURN_TO_ORIGINATOR", "RETURN_TO_STEP", "TERMINATE"], why: "STEP_NOT_ON_ROUTE" });
  });

  it("returns only to a step before the rejecting one", () => {
    const out = rejectionOutcome({ snapshot: { ...snapshot, returnToRoleCode: CEO }, committee: null, steps: above300k, rejectingSeq: 3, supports: ALL });
    expect(out).toMatchObject({ why: "STEP_NOT_ON_ROUTE" });
  });

  it("unset: the officer chooses — never a refusal, never a default (CO-5)", () => {
    const out = rejectionOutcome({ snapshot: { snapshotAt: on, kind: null, returnToRoleCode: null }, committee: null, steps: above300k, rejectingSeq: 2, supports: ALL });
    expect(out).toEqual({ choose: ["RETURN_TO_ORIGINATOR", "RETURN_TO_STEP", "TERMINATE"], why: "NOT_SET" });
    // On the first step there is no earlier step to return to.
    expect(rejectionOutcome({ snapshot: { snapshotAt: on, kind: null, returnToRoleCode: null }, committee: null, steps: above300k, rejectingSeq: 1, supports: ALL })).toEqual({ choose: ["RETURN_TO_ORIGINATOR", "TERMINATE"], why: "NOT_SET" });
  });

  it("a route opened before the snapshot existed is treated as unset", () => {
    expect(rejectionOutcome({ snapshot: { snapshotAt: null, kind: null, returnToRoleCode: null }, committee: null, steps: above300k, rejectingSeq: 4, supports: ALL })).toMatchObject({ why: "NOT_SET" });
  });

  it("a committee's snapshotted outcome governs its step (CO-3): loop to the originator, terminal ends", () => {
    expect(rejectionOutcome({ snapshot, committee: { kind: "LOOP" }, steps: above300k, rejectingSeq: 3, supports: ALL })).toEqual({ apply: "RETURN_TO_ORIGINATOR", source: "COMMITTEE_OUTCOME" });
    expect(rejectionOutcome({ snapshot, committee: { kind: "TERMINAL" }, steps: above300k, rejectingSeq: 3, supports: ALL })).toEqual({ apply: "TERMINATE", source: "COMMITTEE_OUTCOME" });
  });

  it("a destination the matter cannot take is the officer's choice", () => {
    expect(rejectionOutcome({ snapshot: { snapshotAt: on, kind: "TERMINATE", returnToRoleCode: null }, committee: null, steps: above300k, rejectingSeq: 2, supports: ["RETURN_TO_ORIGINATOR", "RETURN_TO_STEP"] })).toEqual({
      choose: ["RETURN_TO_ORIGINATOR", "RETURN_TO_STEP"],
      why: "NOT_SUPPORTED",
    });
  });

  it("editing the configuration after the route opened changes nothing: only the snapshot is read", () => {
    const atOpen = rejectionSnapshot([row({})], "requisition", on, on);
    const later = [row({ id: "d2", kind: "TERMINATE", returnToRoleCode: null, effectiveFrom: new Date("2026-10-02T00:00:00Z") })];
    expect(destinationFor(later, "requisition", new Date("2026-10-03T00:00:00Z"))).toMatchObject({ row: { kind: "TERMINATE" } });
    const out = rejectionOutcome({ snapshot: { snapshotAt: atOpen.rejectionSnapshotAt, kind: atOpen.rejectionKind, returnToRoleCode: atOpen.rejectionReturnToRoleCode }, committee: null, steps: above300k, rejectingSeq: 4, supports: ALL });
    expect(out).toEqual({ apply: "RETURN_TO_STEP", source: "CONFIGURED", returnToSeq: 2 });
  });
});

describe("the successor route (successorSteps, ADR 0009)", () => {
  const decided = (sequence: number, roleCode: string, decision: string, committee = false): DecidedStep => ({
    id: `s${sequence}`,
    sequence,
    roleCode,
    roleLabel: roleCode,
    act: sequence === 4 ? "A" : "R",
    committeeCode: committee ? roleCode : null,
    nonDelegable: false,
    sourceRuleKey: "RULE",
    decision,
    decidedByPersonId: decision === "PENDING" ? null : `p${sequence}`,
    decidedByName: null,
    decidedOn: decision === "PENDING" ? null : on,
    delegationId: null,
    reason: "",
    receivedOn: null,
    recordedAt: null,
  });
  const route = [decided(1, HOD, "DONE"), decided(2, HODIV, "DONE"), decided(3, FD, "DONE", true), decided(4, CEO, "REJECTED")];

  it("worked example: back to the Head of Division — the Head of Department is carried, the Head of Division, the Functional Director and the CEO are pending", () => {
    const next = successorSteps(route, 2);
    expect(next.map((s) => [s.roleCode, s.decision])).toEqual([
      [HOD, "DONE"],
      [HODIV, "PENDING"],
      [FD, "PENDING"],
      [CEO, "PENDING"],
    ]);
    expect(next[0]).toMatchObject({ carriedFromStepId: "s1", decidedByPersonId: "p1" });
    expect(next[1]).toMatchObject({ carriedFromStepId: null });
  });

  it("never shortens the chain (FR-APR-004)", () => {
    for (const to of [1, 2, 3, 4]) expect(successorSteps(route, to).map((s) => s.sequence)).toEqual([1, 2, 3, 4]);
  });

  it("carries a committee step as a pointer to where it was decided, never as a fresh citation (C3)", () => {
    const next = successorSteps(route, 4);
    expect(next[2]).toMatchObject({ carriedFromStepId: "s3", committeeCode: FD, decision: "DONE" });
    expect(next[2]).not.toHaveProperty("committeeDecisionId");
  });
});

describe("the officer's choice (choiceFault, CO-5)", () => {
  const route = { status: "REJECTED", applied: null, offered: [...ALL], steps: above300k, rejectingSeq: 4 };
  const choice = { kind: "RETURN_TO_STEP" as const, returnToSeq: 2, personId: "p1", reason: "Rework the scope" };
  it("records a return to an earlier step with the person and a reason", () => {
    expect(choiceFault(route, choice)).toBeNull();
  });
  it.each([
    [{ ...route, status: "PENDING" }, choice, "NOT_AWAITING"],
    [{ ...route, applied: "TERMINATE" as const }, choice, "NOT_AWAITING"],
    [{ ...route, offered: ["TERMINATE" as const] }, choice, "NOT_OFFERED"],
    [route, { ...choice, returnToSeq: null }, "STEP_REQUIRED"],
    [route, { ...choice, returnToSeq: 4 }, "STEP_NOT_EARLIER"],
    [route, { ...choice, personId: null }, "PERSON_REQUIRED"],
    [route, { ...choice, reason: " " }, "REASON_REQUIRED"],
  ] as const)("refuses %#", (r, c, fault) => {
    expect(choiceFault(r, c)).toBe(fault);
    expect(CHOICE_FAULT_TEXT[fault]).toBeTruthy();
  });
  it("offers a return to a step only where there is one", () => {
    expect(choicesFor(ALL, above300k, 1)).toEqual(["RETURN_TO_ORIGINATOR", "TERMINATE"]);
  });
});

describe("saving a destination (destinationRowFaults)", () => {
  const base = { id: "new", domain: "requisition", kind: "RETURN_TO_STEP" as const, returnToRoleCode: HODIV, effectiveFrom: on, effectiveTo: null };
  it("needs the office for a return to a step, and only then", () => {
    expect(destinationRowFaults({ ...base, returnToRoleCode: null }, [], [HODIV])).toEqual(["ROLE_REQUIRED"]);
    expect(destinationRowFaults({ ...base, kind: "TERMINATE" }, [], [HODIV])).toEqual(["ROLE_NOT_ALLOWED"]);
    expect(destinationRowFaults({ ...base, returnToRoleCode: "X" }, [], [HODIV])).toEqual(["ROLE_UNKNOWN"]);
    expect(destinationRowFaults({ ...base, domain: "other" }, [], [HODIV])).toEqual(["DOMAIN_UNKNOWN"]);
  });
  it("refuses two rows of one matter type taking effect the same day", () => {
    expect(destinationRowFaults(base, [{ ...base, id: "d1" }], [HODIV])).toEqual(["SAME_DAY"]);
    expect(destinationRowFaults(base, [{ ...base, id: "d1", domain: "appointment" }], [HODIV])).toEqual([]);
  });
});

describe("the destination in words", () => {
  it("tells the approver what happens, from the snapshot, and says unset plainly", () => {
    expect(ifRejectedText({ snapshotAt: on, kind: "RETURN_TO_STEP", returnToOffice: "Head of Division", provenance: "ASSUMED" }, false)).toBe("If rejected: returns to the Head of Division's step (configured; source: assumed).");
    expect(ifRejectedText({ snapshotAt: on, kind: null, returnToOffice: null, provenance: null }, false)).toMatch(/not set — the officer will choose/);
    expect(ifRejectedText({ snapshotAt: null, kind: null, returnToOffice: null, provenance: null }, false)).toMatch(/not recorded/);
    // Said of a step with no step of the named office before it: the return cannot apply.
    const toDiv = { snapshotAt: on, kind: "RETURN_TO_STEP" as const, returnToOffice: "Head of Division", provenance: "ASSUMED" };
    expect(ifRejectedText(toDiv, false, false)).toBe("If rejected at this step: the configured return is to the Head of Division, but no step of that office comes before this one — the officer will choose where it goes.");
    expect(ifRejectedText(toDiv, false, true)).toBe("If rejected: returns to the Head of Division's step (configured; source: assumed).");
    expect(ifRejectedText({ snapshotAt: on, kind: "TERMINATE", returnToOffice: null, provenance: null }, true)).toMatch(/committee's own/);
  });
  it("never shows an officer's choice as policy", () => {
    // Phase 2b (decisions log, 2026-10-07): the trail and the screen name the person and say how the act was recorded only from its attribution (signed, or recorded from
  // paper); the fixed words "recorded on behalf of, not signed" were written under every act and were true of some.
    expect(appliedText("TERMINATE", "OFFICER_CHOICE", null, "Aminah")).toMatch(/chosen by Aminah.*not policy/);
    expect(appliedText("TERMINATE", "OFFICER_CHOICE", null, "Aminah", "Recorded by Clerk on behalf of Aminah, not signed")).toMatch(/Recorded by Clerk on behalf of Aminah, not signed.*not policy/);
    expect(appliedText("RETURN_TO_ORIGINATOR", "COMMITTEE_OUTCOME", null, null)).toMatch(/committee's not-carried outcome/);
  });
});

describe("returnTargetBeforeNext", () => {
  const steps = [
    { sequence: 1, roleCode: "SEC_PRE", decision: "DONE" },
    { sequence: 2, roleCode: "HOD_CP", decision: "PENDING" },
    { sequence: 3, roleCode: "FD", decision: "PENDING" },
  ];
  it("says whether the named office has a step before the next one pending", () => {
    expect(returnTargetBeforeNext({ rejectionKind: "RETURN_TO_STEP", rejectionReturnToRoleCode: "SEC_PRE", steps })).toBe(true);
    expect(returnTargetBeforeNext({ rejectionKind: "RETURN_TO_STEP", rejectionReturnToRoleCode: "HOD_CP", steps })).toBe(false);
  });
  it("does not arise for other destinations or a route with nothing pending", () => {
    expect(returnTargetBeforeNext({ rejectionKind: "TERMINATE", rejectionReturnToRoleCode: null, steps })).toBeUndefined();
    expect(returnTargetBeforeNext({ rejectionKind: "RETURN_TO_STEP", rejectionReturnToRoleCode: "SEC_PRE", steps: steps.map((s) => ({ ...s, decision: "DONE" })) })).toBeUndefined();
  });
});

describe("returnTargetBefore", () => {
  const steps = [
    { sequence: 1, roleCode: "HOD" },
    { sequence: 2, roleCode: "HODIV" },
    { sequence: 3, roleCode: "CEO" },
  ];
  const toDiv = { rejectionKind: "RETURN_TO_STEP", rejectionReturnToRoleCode: "HODIV", steps };
  it("is true only for a step with a step of the named office before it", () => {
    expect(returnTargetBefore(toDiv, 3)).toBe(true);
    expect(returnTargetBefore(toDiv, 2)).toBe(false);
    expect(returnTargetBefore(toDiv, 1)).toBe(false);
  });
  it("does not arise for a route that returns nowhere in particular", () => {
    expect(returnTargetBefore({ ...toDiv, rejectionKind: "RETURN_TO_ORIGINATOR", rejectionReturnToRoleCode: null }, 3)).toBeUndefined();
    expect(returnTargetBefore({ ...toDiv, rejectionKind: null }, 3)).toBeUndefined();
  });
});
