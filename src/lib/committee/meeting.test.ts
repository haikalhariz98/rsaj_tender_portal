import { describe, expect, it } from "vitest";

import { decisionRecord } from "./record";
import { isFrozen, meetingTransition, sittingPermits } from "./meeting";
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
    notApprovedOutcomeNameEn: null,
    notApprovedOutcomeKind: null,
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

  it("reads the not-approved outcome from the decision's own snapshot", () => {
    const r = decisionRecord({
      meeting,
      decision: { ...decision, outcome: "NOT_CARRIED", notApprovedOutcomeNameEn: "Return", notApprovedOutcomeKind: "LOOP" },
      votes: [],
    });
    expect(r?.notApproved).toEqual({ nameEn: "Return", kind: "LOOP" });
  });

  it("gives nothing for a pending matter", () => {
    expect(decisionRecord({ meeting, decision: { ...decision, outcome: "PENDING" }, votes: [] })).toBeNull();
  });
});

describe("meetingTransition, hardened", () => {
  it("refuses to start a sitting dated after today", () => {
    const f = { minutes: "", reason: "", matterOutcomes: [] as const };
    expect(meetingTransition("SCHEDULED", "IN_PROGRESS", { ...f, today: "2026-09-30", meetingDay: "2026-10-15" })).toEqual({
      ok: false,
      fault: "NOT_YET_DUE",
    });
    expect(meetingTransition("SCHEDULED", "IN_PROGRESS", { ...f, today: "2026-10-15", meetingDay: "2026-10-15" })).toEqual({ ok: true });
  });
  it("refuses to minute a faulty register or a decision that no longer holds", () => {
    const f = { minutes: "Minuted.", reason: "", matterOutcomes: ["CARRIED"] as const };
    expect(meetingTransition("IN_PROGRESS", "MINUTED", { ...f, registerFaults: 1 })).toEqual({ ok: false, fault: "REGISTER_FAULTS" });
    expect(meetingTransition("IN_PROGRESS", "MINUTED", { ...f, brokenDecisions: 1 })).toEqual({
      ok: false,
      fault: "DECISION_NO_LONGER_HOLDS",
    });
  });
});

describe("sittingPermits (ruling 8.2)", () => {
  it("takes votes, attendance and outcomes only while in progress", () => {
    for (const act of ["VOTE", "ATTENDANCE", "OUTCOME"] as const) {
      expect(sittingPermits("SCHEDULED", act)).toBe(false);
      expect(sittingPermits("IN_PROGRESS", act)).toBe(true);
    }
  });
  it("takes tabling and recusals before the sitting, and nothing once closed", () => {
    expect(sittingPermits("SCHEDULED", "TABLE")).toBe(true);
    expect(sittingPermits("SCHEDULED", "RECUSE")).toBe(true);
    expect(sittingPermits("MINUTED", "TABLE")).toBe(false);
    expect(sittingPermits("CANCELLED", "RECUSE")).toBe(false);
  });
});

describe("secretariatHoldersOn", () => {
  it("judges the holder on the tabling day", async () => {
    const { secretariatHoldersOn } = await import("./tabling");
    const person = (id: string) => ({ id, staffNo: null, name: id, email: null, jobTitle: null, jobTitleMs: null, department: null, telephone: null, portalRoleCode: null, authorityLevel: null, isAvailable: true, isActive: true });
    const roster = {
      people: [person("old"), person("new")],
      offices: [],
      assignments: [
        { id: "a", personId: "old", roleCode: "SEC", scope: null, effectiveFrom: new Date("2026-01-01T00:00:00Z"), effectiveTo: new Date("2026-09-30T00:00:00Z") },
        { id: "b", personId: "new", roleCode: "SEC", scope: null, effectiveFrom: new Date("2026-09-30T00:00:00Z"), effectiveTo: null },
      ],
    };
    expect(secretariatHoldersOn(roster, "SEC", "2026-09-29").map((h) => h.id)).toEqual(["old"]);
    expect(secretariatHoldersOn(roster, "SEC", "2026-09-30").map((h) => h.id)).toEqual(["new"]);
    expect(secretariatHoldersOn(roster, null, "2026-09-30")).toEqual([]);
  });
});
