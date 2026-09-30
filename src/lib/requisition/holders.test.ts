import { describe, expect, it } from "vitest";

import type { Delegation } from "@/lib/people/delegation";
import type { Roster } from "@/lib/people/roster";

import { deciderFaults, holdersFor, requesterHoldsApprover, type DeciderContext } from "./holders";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const person = (id: string, isActive = true) => ({
  id, staffNo: null, name: id, email: null, jobTitle: null, jobTitleMs: null, department: null, telephone: null,
  portalRoleCode: null, authorityLevel: null, isAvailable: true, isActive,
});
const assignment = (id: string, personId: string, roleCode: string, scope: string | null) => ({ id, personId, roleCode, scope, effectiveFrom: d("2024-01-01"), effectiveTo: null });
const ROSTER: Roster = {
  people: [person("hodNth"), person("hodOrg"), person("div"), person("deputy")],
  offices: [],
  assignments: [assignment("a1", "hodNth", "DEPT_HEAD", "NTH"), assignment("a2", "hodOrg", "DEPT_HEAD", null), assignment("a3", "div", "DIV_HEAD", "OPS")],
};
const delegation = (over: Partial<Delegation> = {}): Delegation => ({
  id: "dg1", fromPersonId: "hodNth", toPersonId: "deputy", roleCode: "DEPT_HEAD", capabilityCodes: [], valueCeiling: null,
  reason: "", reasonMs: "", noSubDelegation: true, effectiveFrom: d("2026-09-01"), effectiveTo: d("2026-10-31"), ...over,
});
const PATH = ["NTH-MNT", "NTH", "OPS", "GRP"];

describe("who holds the office for the requesting unit", () => {
  it("takes the unit's own holder before an organisation-wide one", () => {
    expect(holdersFor("DEPT_HEAD", PATH, ROSTER, [], "2026-09-30")).toMatchObject({ scope: "NTH", holderIds: ["hodNth"] });
  });

  it("climbs to the nearest ancestor, then organisation-wide", () => {
    expect(holdersFor("DIV_HEAD", PATH, ROSTER, [], "2026-09-30")).toMatchObject({ scope: "OPS", holderIds: ["div"] });
    expect(holdersFor("DEPT_HEAD", ["CP", "OPS"], ROSTER, [], "2026-09-30")).toMatchObject({ scope: null, holderIds: ["hodOrg"] });
  });

  it("counts a live delegation of the whole office, never a listed subset", () => {
    expect(holdersFor("DEPT_HEAD", PATH, ROSTER, [delegation()], "2026-09-30").delegates.map((x) => x.personId)).toEqual(["deputy"]);
    expect(holdersFor("DEPT_HEAD", PATH, ROSTER, [delegation({ capabilityCodes: ["approve_requirement"] })], "2026-09-30").delegates).toEqual([]);
    expect(holdersFor("DEPT_HEAD", PATH, ROSTER, [delegation()], "2026-11-30").delegates).toEqual([]);
  });
});

describe("who may discharge a step (ruling OD-12)", () => {
  const step = { committeeCode: null, nonDelegable: false, decision: "PENDING" };
  const ctx = (over: Partial<DeciderContext> = {}): DeciderContext => ({
    today: "2026-09-30",
    holders: holdersFor("DEPT_HEAD", PATH, ROSTER, [delegation({ valueCeiling: "10000.00" })], "2026-09-30"),
    person: { id: "hodNth", isActive: true },
    requesterId: "req",
    endorserIds: [],
    otherDeciderIds: [],
    earlierDone: true,
    decidedOn: "2026-09-30",
    openedOn: "2026-09-20",
    value: 3_800_000n,
    ...over,
  });

  it("accepts the holder", () => {
    expect(deciderFaults(step, ctx()).faults).toEqual([]);
  });

  it("refuses someone who holds nothing for this unit", () => {
    expect(deciderFaults(step, ctx({ person: { id: "hodOrg", isActive: true } })).faults).toContain("NOT_HOLDER");
  });

  it("accepts a delegate, names the delegation, and holds them to its ceiling", () => {
    const within = deciderFaults(step, ctx({ person: { id: "deputy", isActive: true }, value: 900_000n }));
    expect(within).toEqual({ faults: [], delegationId: "dg1" });
    expect(deciderFaults(step, ctx({ person: { id: "deputy", isActive: true } })).faults).toContain("OVER_CEILING");
    expect(deciderFaults({ ...step, nonDelegable: true }, ctx({ person: { id: "deputy", isActive: true } })).faults).toContain("DELEGATION_NOT_PERMITTED");
  });

  it("refuses the requester, an endorser, and someone who discharged another step", () => {
    expect(deciderFaults(step, ctx({ requesterId: "hodNth" })).faults).toContain("SELF_APPROVAL");
    expect(deciderFaults(step, ctx({ endorserIds: ["hodNth"] })).faults).toContain("ENDORSED_IT");
    expect(deciderFaults(step, ctx({ otherDeciderIds: ["hodNth"] })).faults).toContain("ALREADY_DISCHARGED_A_STEP");
  });

  it("refuses a future date, a date before submission, and a step taken out of order", () => {
    expect(deciderFaults(step, ctx({ decidedOn: "2026-10-01" })).faults).toContain("FUTURE_DATE");
    expect(deciderFaults(step, ctx({ decidedOn: "2026-09-19" })).faults).toContain("BEFORE_SUBMISSION");
    expect(deciderFaults(step, ctx({ earlierDone: false })).faults).toContain("OUT_OF_ORDER");
  });

  it("leaves a committee step to the committee, and waits for a time zone", () => {
    expect(deciderFaults({ ...step, committeeCode: "BOARD" }, ctx()).faults).toEqual(["COMMITTEE_STEP"]);
    expect(deciderFaults(step, ctx({ today: null })).faults).toEqual(["TIME_ZONE_UNSET"]);
  });
});

describe("an endorser deciding a step (ruling BD-1)", () => {
  const step = { committeeCode: null, nonDelegable: false, decision: "PENDING" };
  const base = {
    today: "2026-09-30", person: { id: "hodNth", isActive: true }, requesterId: "req", endorserIds: [] as string[], otherDeciderIds: [] as string[],
    earlierDone: true, decidedOn: "2026-09-30", openedOn: "2026-09-20", value: 3_800_000n,
  };

  it("lets the department-tier endorser decide the Head of Department step they hold directly", () => {
    const holders = holdersFor("DEPT_HEAD", PATH, ROSTER, [], "2026-09-30");
    const r = deciderFaults(step, { ...base, holders, endorsements: [{ personId: "hodNth", unitCode: "NTH" }] });
    expect(r.faults).toEqual([]);
  });

  it("refuses a section-head endorser deciding the Head of Department step as a delegate", () => {
    const sectionDeleg = { ...delegation(), toPersonId: "sectionHead", valueCeiling: null };
    const holders = holdersFor("DEPT_HEAD", PATH, ROSTER, [sectionDeleg], "2026-09-30");
    const r = deciderFaults(step, { ...base, holders, person: { id: "sectionHead", isActive: true }, endorsements: [{ personId: "sectionHead", unitCode: "NTH-MNT" }] });
    expect(r.faults).toContain("ENDORSED_IT");
  });

  it("refuses an endorser deciding another office's step", () => {
    const holders = holdersFor("DIV_HEAD", PATH, ROSTER, [], "2026-09-30");
    const r = deciderFaults(step, { ...base, holders, person: { id: "div", isActive: true }, endorsements: [{ personId: "div", unitCode: "NTH" }] });
    expect(r.faults).toContain("ENDORSED_IT");
  });

  it("still refuses the requester, endorser or not", () => {
    const holders = holdersFor("DEPT_HEAD", PATH, ROSTER, [], "2026-09-30");
    const r = deciderFaults(step, { ...base, holders, requesterId: "hodNth", endorsements: [{ personId: "hodNth", unitCode: "NTH" }] });
    expect(r.faults).toContain("SELF_APPROVAL");
  });
});

describe("whether the requester is approving their own requisition (code review, item 9)", () => {
  it("is scoped to the requisition's unit: a holder elsewhere is not", () => {
    expect(requesterHoldsApprover("DEPT_HEAD", "hodNth", PATH, ROSTER, [], "2026-09-30")).toBe(true);
    // hodOrg holds the office organisation-wide, but NTH has its own holder.
    expect(requesterHoldsApprover("DEPT_HEAD", "hodOrg", PATH, ROSTER, [], "2026-09-30")).toBe(false);
  });
});
