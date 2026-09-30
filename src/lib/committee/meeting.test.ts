import { describe, expect, it } from "vitest";

import { decisionRecord } from "./record";
import { isFrozen, meetingTransition } from "./meeting";
import { checkTabling } from "./tabling";

describe("meetingTransition", () => {
  const none = { minutes: "", reason: "", matterOutcomes: [] as const };

  it("follows the lifecycle", () => {
    expect(meetingTransition("SCHEDULED", "IN_PROGRESS", none)).toEqual({ ok: true });
    expect(meetingTransition("SCHEDULED", "MINUTED", none)).toEqual({ ok: false, fault: "NOT_ALLOWED" });
  });

  it("refuses to minute with a pending matter or empty minutes", () => {
    expect(
      meetingTransition("IN_PROGRESS", "MINUTED", { minutes: "Minuted.", reason: "", matterOutcomes: ["CARRIED", "PENDING"] }),
    ).toEqual({ ok: false, fault: "MATTERS_PENDING" });
    expect(meetingTransition("IN_PROGRESS", "MINUTED", { minutes: "  ", reason: "", matterOutcomes: ["CARRIED"] })).toEqual({
      ok: false,
      fault: "MINUTES_REQUIRED",
    });
    expect(
      meetingTransition("IN_PROGRESS", "MINUTED", { minutes: "Minuted.", reason: "", matterOutcomes: ["CARRIED", "DEFERRED"] }),
    ).toEqual({ ok: true });
  });

  it("refuses any move out of MINUTED or CANCELLED", () => {
    for (const to of ["SCHEDULED", "IN_PROGRESS", "CANCELLED", "MINUTED"] as const) {
      expect(meetingTransition("MINUTED", to, { minutes: "x", reason: "x", matterOutcomes: [] })).toEqual({
        ok: false,
        fault: "NOT_ALLOWED",
      });
      expect(meetingTransition("CANCELLED", to, { minutes: "x", reason: "x", matterOutcomes: [] }).ok).toBe(false);
    }
    expect(isFrozen("MINUTED")).toBe(true);
    expect(isFrozen("IN_PROGRESS")).toBe(false);
  });

  it("cancels only with a reason and before any matter is decided", () => {
    expect(meetingTransition("SCHEDULED", "CANCELLED", none)).toEqual({ ok: false, fault: "REASON_REQUIRED" });
    expect(
      meetingTransition("IN_PROGRESS", "CANCELLED", { minutes: "", reason: "Chair unwell", matterOutcomes: ["NOT_CARRIED"] }),
    ).toEqual({ ok: false, fault: "MATTERS_DECIDED" });
    expect(
      meetingTransition("IN_PROGRESS", "CANCELLED", { minutes: "", reason: "Chair unwell", matterOutcomes: ["DEFERRED"] }),
    ).toEqual({ ok: true });
  });
});

describe("checkTabling", () => {
  it("refuses when no Secretariat office is set", () => {
    expect(checkTabling({ secretariatRoleCode: null, tabledByPersonId: "p", holderIdsOnDate: ["p"] })).toEqual({
      ok: false,
      fault: "SECRETARIAT_NOT_SET",
    });
  });
  it("refuses a tabler who does not hold the office on the date", () => {
    expect(checkTabling({ secretariatRoleCode: "SEC", tabledByPersonId: "q", holderIdsOnDate: ["p"] })).toEqual({
      ok: false,
      fault: "NOT_SECRETARIAT_HOLDER",
    });
  });
  it("refuses a matter with no tabler, and accepts a holder", () => {
    expect(checkTabling({ secretariatRoleCode: "SEC", tabledByPersonId: null, holderIdsOnDate: ["p"] }).ok).toBe(false);
    expect(checkTabling({ secretariatRoleCode: "SEC", tabledByPersonId: "p", holderIdsOnDate: ["p"] })).toEqual({ ok: true });
  });
});

describe("decisionRecord", () => {
  const meeting = { reference: "TB 1/2026", meetingDate: new Date("2026-03-01T00:00:00Z"), committeeName: "Board" };
  const decision = {
    subject: "Award",
    matterRef: "X-1",
    outcome: "CARRIED" as const,
    decisionDate: new Date("2026-03-01T00:00:00Z"),
    quorumRequired: 3,
    presentVoters: 3,
    recusedCount: 0,
    votingRule: "SIMPLE_MAJORITY" as const,
    votingRuleProvenance: "STATED",
    outcomeNote: "",
    notApprovedOutcome: null,
  };

  it("reads from the snapshot, with each member's vote and sheet date", () => {
    const r = decisionRecord({
      meeting,
      decision,
      votes: [
        { name: "Zed", choice: "SETUJU", comment: "", votedAt: new Date("2026-03-01T00:00:00Z") },
        { name: "Ann", choice: "TIDAK_SETUJU", comment: "Price", votedAt: new Date("2026-03-02T00:00:00Z") },
      ],
    });
    expect(r?.quorum).toEqual({ required: 3, present: 3, recused: 0 });
    expect(r?.votingRule).toEqual({ rule: "SIMPLE_MAJORITY", provenance: "STATED" });
    expect(r?.votes.map((v) => v.name)).toEqual(["Ann", "Zed"]);
    expect(r?.meetingReference).toBe("TB 1/2026");
  });

  it("gives nothing for a pending matter", () => {
    expect(decisionRecord({ meeting, decision: { ...decision, outcome: "PENDING" }, votes: [] })).toBeNull();
  });
});
