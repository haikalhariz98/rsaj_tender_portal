import { describe, expect, it } from "vitest";

import { committeeCitationWrite, decidedStepRecord, personDecisionWrite, type StoredRoute, type StoredStep } from "./decided-step";

/**
 * FR-APR-007: every completed step can be reconstructed years later — who acted, the
 * office held, the act, the decision, when it was decided and when recorded, the
 * comment, and the clause and issue of the limits relied on.
 *
 * Worked example a reader can check by hand: the Head of Division recommends a
 * requisition routed under "DAL Issue A, Rev 00", clause §3.1.4.1. Siti Aminah decides
 * it on 30 Sep 2026; it is recorded the next morning; she wrote "Within the unit's plan."
 */

const pending: StoredStep = {
  roleCode: "HODIV",
  roleLabel: "Head of Division",
  actingRoleCode: null,
  actingRoleLabel: null,
  act: "R",
  decision: "PENDING",
  decidedByPersonId: null,
  decidedByName: null,
  decidedOn: null,
  recordedAt: null,
  reason: "",
  delegationId: null,
  committeeDecisionId: null,
};

const route: StoredRoute = {
  authorityMatrixId: "issue-a-rev00",
  matrixLabel: "DAL Issue A, Rev 00",
  ruleClause: "§3.1.4.1",
  fundingOverrideApplied: false,
  overrideMatrixId: null,
  overrideMatrixLabel: null,
};

const decidedOn = new Date("2026-09-30T00:00:00Z");
const recordedAt = new Date("2026-10-01T01:15:00Z");

describe("the decided-step record (FR-APR-007)", () => {
  it("records who acted, the office held, the act, the decision, both times, the comment, the clause and the issue", () => {
    const written = personDecisionWrite({ decision: "DONE", person: { id: "p-siti", name: "Siti Aminah" }, decidedOn, delegationId: null, reason: "Within the unit's plan.", recordedAt });
    const record = decidedStepRecord({ ...pending, ...written }, route);
    expect(record).toEqual({
      actor: { kind: "PERSON", personId: "p-siti", name: "Siti Aminah" },
      office: { code: "HODIV", label: "Head of Division" },
      act: "R",
      decision: "DONE",
      underDelegation: false,
      decidedOn,
      recordedAt,
      comment: "Within the unit's plan.",
      clause: "§3.1.4.1",
      issue: { id: "issue-a-rev00", label: "DAL Issue A, Rev 00" },
    });
  });

  it("keeps the decision day and the moment recorded apart: a decision recorded later is not re-dated", () => {
    const written = personDecisionWrite({ decision: "DONE", person: { id: "p1", name: "A" }, decidedOn, delegationId: null, reason: "", recordedAt });
    const record = decidedStepRecord({ ...pending, ...written }, route)!;
    expect(record.decidedOn).toEqual(decidedOn);
    expect(record.recordedAt).toEqual(recordedAt);
    expect(record.decidedOn).not.toEqual(record.recordedAt);
  });

  it("names the office acting for an escalated step, not the office first routed to", () => {
    const written = personDecisionWrite({ decision: "DONE", person: { id: "p-fd", name: "Farid" }, decidedOn, delegationId: null, reason: "", recordedAt });
    const record = decidedStepRecord({ ...pending, actingRoleCode: "FD", actingRoleLabel: "Functional Director", ...written }, route)!;
    expect(record.office).toEqual({ code: "FD", label: "Functional Director" });
  });

  it("records a rejection with its reason, and a decision under delegation as such", () => {
    const written = personDecisionWrite({ decision: "REJECTED", person: { id: "p-d", name: "Delegate" }, decidedOn, delegationId: "dl-1", reason: "No budget this year.", recordedAt });
    const record = decidedStepRecord({ ...pending, ...written }, route)!;
    expect(record.decision).toBe("REJECTED");
    expect(record.comment).toBe("No budget this year.");
    expect(record.underDelegation).toBe(true);
  });

  it("reads the issue the route pinned: the funder's rule set where it superseded the limits", () => {
    const written = personDecisionWrite({ decision: "DONE", person: { id: "p1", name: "A" }, decidedOn, delegationId: null, reason: "", recordedAt });
    const funded = { ...route, fundingOverrideApplied: true, overrideMatrixId: "funder-2026", overrideMatrixLabel: "Ministry rules 2026" };
    expect(decidedStepRecord({ ...pending, ...written }, funded)!.issue).toEqual({ id: "funder-2026", label: "Ministry rules 2026" });
  });

  it("records a committee's decision against the committee, with no person, and the decision it cites", () => {
    const written = committeeCitationWrite({ decision: "DONE", committeeName: "Quotation Committee", decidedOn, committeeDecisionId: "cd-7", recordedAt });
    const record = decidedStepRecord({ ...pending, roleCode: "QC", roleLabel: "Quotation Committee", act: "MR", ...written }, route)!;
    expect(record.actor).toEqual({ kind: "COMMITTEE", name: "Quotation Committee", committeeDecisionId: "cd-7" });
    expect(record.act).toBe("MR");
    expect(written).not.toHaveProperty("decidedByPersonId");
  });

  it("writes the day received only where the route records it, so no other route's write clears it", () => {
    const base = { decision: "DONE" as const, person: { id: "p1", name: "A" }, decidedOn, delegationId: null, reason: "", recordedAt };
    expect(personDecisionWrite(base)).not.toHaveProperty("receivedOn");
    expect(personDecisionWrite({ ...base, receivedOn: null })).toHaveProperty("receivedOn", null);
  });

  it("has no record for a step not decided", () => {
    expect(decidedStepRecord(pending, route)).toBeNull();
  });
});
