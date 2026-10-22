import { describe, expect, it } from "vitest";

import type { Delegation } from "@/lib/people/delegation";
import type { Roster } from "@/lib/people/roster";

import { ableToAct, deciderFaults, holdersFor, NO_EARLIER_RECORDERS, requesterHoldsApprover, type DeciderContext } from "./holders";

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

describe("the engine takes a delegation's authority from the jobholder's holding (ruling of 2026-10-08 on log line 1773)", () => {
  it("a delegation that records a jobholder carries the JOBHOLDER's office, whoever the grantor is, and the grantor need hold none", () => {
    // "div" holds DIV_HEAD for OPS; the grantor is "hodOrg" (another officer who does not hold DIV_HEAD), the jobholder "div".
    const viaJobholder = delegation({ id: "j1", roleCode: "DIV_HEAD", fromPersonId: "hodOrg", jobholderPersonId: "div", toPersonId: "deputy", effectiveFrom: d("2026-09-01"), effectiveTo: d("2026-10-31") });
    expect(holdersFor("DIV_HEAD", PATH, ROSTER, [viaJobholder], "2026-09-30").delegates.map((x) => x.personId)).toEqual(["deputy"]);
  });

  it("a delegation whose jobholder does not hold the office on the day carries nothing, even where its grantor does", () => {
    const wrongJobholder = delegation({ id: "j2", roleCode: "DIV_HEAD", fromPersonId: "div", jobholderPersonId: "hodOrg", toPersonId: "deputy", effectiveFrom: d("2026-09-01"), effectiveTo: d("2026-10-31") });
    expect(holdersFor("DIV_HEAD", PATH, ROSTER, [wrongJobholder], "2026-09-30").delegates).toEqual([]);
  });

  it("a delegation recorded before the rule (no jobholder) is read as it always was: the grantor is the holder", () => {
    const legacy = delegation({ id: "old", roleCode: "DIV_HEAD", fromPersonId: "div", jobholderPersonId: null, toPersonId: "deputy", effectiveFrom: d("2026-09-01"), effectiveTo: d("2026-10-31") });
    expect(holdersFor("DIV_HEAD", PATH, ROSTER, [legacy], "2026-09-30").delegates.map((x) => x.personId)).toEqual(["deputy"]);
    const notHolder = delegation({ id: "old2", roleCode: "DIV_HEAD", fromPersonId: "hodOrg", toPersonId: "deputy", effectiveFrom: d("2026-09-01"), effectiveTo: d("2026-10-31") });
    expect(holdersFor("DIV_HEAD", PATH, ROSTER, [notHolder], "2026-09-30").delegates).toEqual([]);
  });
});

describe("the sender of a name or an appointment route may not decide it (ruling of 2026-10-08 on log line 1789)", () => {
  const step = { committeeCode: null, nonDelegable: false, decision: "PENDING" };
  const ctx = (over: Partial<DeciderContext> = {}): DeciderContext => ({
    today: "2026-09-30",
    holders: holdersFor("DEPT_HEAD", PATH, ROSTER, [], "2026-09-30"),
    person: { id: "hodNth", isActive: true },
    requesterId: "req",
    endorserIds: [],
    otherDeciderIds: [], earlier: NO_EARLIER_RECORDERS,
    earlierDone: true,
    decidedOn: "2026-09-30",
    openedOn: "2026-09-20",
    value: 3_800_000n,
    ...over,
  });

  it("refuses the sender, as the holder of the office, with a fault of its own and not the requisition's 'raised it'", () => {
    expect(deciderFaults(step, ctx({ senderId: "hodNth" })).faults).toEqual(["SENT_IT"]);
  });

  it("still refuses the requisition's raiser, and says that, when they are also the sender", () => {
    expect(deciderFaults(step, ctx({ requesterId: "hodNth", senderId: "hodNth" })).faults).toEqual(["SELF_APPROVAL"]);
  });

  it("refuses the officer who records a decision for someone else when they are the sender", () => {
    expect(deciderFaults(step, ctx({ senderId: "clerk", recorderId: "clerk" })).faults).toEqual(["RECORDER_IS_REQUESTER"]);
  });

  it("bars nobody extra where no sender is given", () => {
    expect(deciderFaults(step, ctx({ senderId: null })).faults).toEqual([]);
    expect(deciderFaults(step, ctx({ senderId: undefined })).faults).toEqual([]);
    expect(deciderFaults(step, ctx({ senderId: "somebodyElse" })).faults).toEqual([]);
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
    otherDeciderIds: [], earlier: NO_EARLIER_RECORDERS,
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

  // Phase 2b (F1): an approval recorded from paper for the holder is also judged against the person recording it.
  it("applies the separation of duties to the person recording it for someone else, and only that: they need not hold the office", () => {
    // The requester records the holder's approval of the requester's own requisition.
    expect(deciderFaults(step, ctx({ requesterId: "clerk", recorderId: "clerk" })).faults).toEqual(["RECORDER_IS_REQUESTER"]);
    expect(deciderFaults(step, ctx({ endorserIds: ["clerk"], recorderId: "clerk" })).faults).toEqual(["RECORDER_ENDORSED_IT"]);
    expect(deciderFaults(step, ctx({ endorsements: [{ personId: "clerk", unitCode: "NTH-MNT" }], recorderId: "clerk" })).faults).toEqual(["RECORDER_ENDORSED_IT"]);
    expect(deciderFaults(step, ctx({ otherDeciderIds: ["clerk"], recorderId: "clerk" })).faults).toEqual(["RECORDER_DECIDED_ANOTHER_STEP"]);
    expect(deciderFaults(step, ctx({ declaredConflictIds: ["clerk"], recorderId: "clerk" })).faults).toEqual(["RECORDER_DECLARED_CONFLICT"]);
    // A recorder who holds nothing and is none of these is not refused: a paper recording needs no office.
    expect(deciderFaults(step, ctx({ recorderId: "clerk" })).faults).toEqual([]);
  });

  // Review of Phase 2b: the slot holds the colleague an act was keyed "for", so the officer who keyed it is read from the attribution (`earlier`).
  describe("the officer who keyed an earlier act for someone else is judged as its author", () => {
    const keyed = (over: Partial<DeciderContext["earlier"]>) => ({ ...NO_EARLIER_RECORDERS, ...over });
    it("exploit A: raises a requisition for a colleague, then signs the approval step as the holder: self-approval", () => {
      // The requester on record is B; A (the holder) keyed it for B.
      expect(deciderFaults(step, ctx({ requesterId: "colleagueB", earlier: keyed({ requesterRecorderIds: ["hodNth"] }) })).faults).toEqual(["SELF_APPROVAL"]);
      // A different holder is not affected.
      expect(deciderFaults(step, ctx({ requesterId: "colleagueB", earlier: keyed({ requesterRecorderIds: ["someoneElse"] }) })).faults).toEqual([]);
    });
    it("exploit A: records the head's endorsement for them, then decides the step as a direct holder: the BD-1 allowance does not reach a keyer", () => {
      const endorsed = { endorsements: [{ personId: "head", unitCode: "NTH" }], earlier: keyed({ endorsementRecorderIds: ["hodNth"] }) };
      expect(deciderFaults(step, ctx(endorsed)).faults).toEqual(["ENDORSED_IT"]);
      // The head's own endorsement, as a direct holder tied to the tier, is still allowed (BD-1): nobody keyed it.
      expect(deciderFaults(step, ctx({ endorsements: [{ personId: "hodNth", unitCode: "NTH" }] })).faults).toEqual([]);
    });
    it("exploit B: records one step for the approver, then signs another step of the route: one person discharging two steps", () => {
      expect(deciderFaults(step, ctx({ earlier: keyed({ otherDeciderRecorderIds: ["hodNth"] }) })).faults).toEqual(["ALREADY_DISCHARGED_A_STEP"]);
    });
    it("the same, as the recorder of this decision for someone else", () => {
      expect(deciderFaults(step, ctx({ recorderId: "clerk", earlier: keyed({ requesterRecorderIds: ["clerk"] }) })).faults).toEqual(["RECORDER_IS_REQUESTER"]);
      expect(deciderFaults(step, ctx({ recorderId: "clerk", earlier: keyed({ endorsementRecorderIds: ["clerk"] }) })).faults).toEqual(["RECORDER_ENDORSED_IT"]);
      expect(deciderFaults(step, ctx({ recorderId: "clerk", earlier: keyed({ otherDeciderRecorderIds: ["clerk"] }) })).faults).toEqual(["RECORDER_DECIDED_ANOTHER_STEP"]);
    });
    it("says each once, and nothing where nobody keyed anything", () => {
      const both = deciderFaults(step, ctx({ requesterId: "hodNth", earlier: keyed({ requesterRecorderIds: ["hodNth"] }) })).faults;
      expect(both.filter((f) => f === "SELF_APPROVAL")).toHaveLength(1);
      expect(deciderFaults(step, ctx({ recorderId: "clerk", requesterId: "clerk", earlier: keyed({ requesterRecorderIds: ["clerk"] }) })).faults).toEqual(["RECORDER_IS_REQUESTER"]);
      expect(deciderFaults(step, ctx({ earlier: NO_EARLIER_RECORDERS })).faults).toEqual([]);
    });
  });

  // RSEC-3(b): a supplier registration names who checked what it holds; none of them decides it, whether deciding or recording the decision for someone else.
  it("refuses whoever checked a certificate or the bank details of the registration, as decider or as recorder", () => {
    const checked = { ...NO_EARLIER_RECORDERS, verifierIds: ["hodNth", "clerk"] };
    expect(deciderFaults(step, ctx({ earlier: checked })).faults).toEqual(["VERIFIED_IT"]);
    expect(deciderFaults(step, ctx({ person: { id: "deputy", isActive: true }, value: 900_000n, recorderId: "clerk", earlier: checked })).faults).toEqual(["RECORDER_VERIFIED_IT"]);
    // Nobody else is touched, and a matter with no checks named is judged as before.
    expect(deciderFaults(step, ctx({ earlier: { ...NO_EARLIER_RECORDERS, verifierIds: ["someoneElse"] } })).faults).toEqual([]);
    expect(deciderFaults(step, ctx({ earlier: { ...NO_EARLIER_RECORDERS, verifierIds: [] } })).faults).toEqual([]);
  });

  it("does not judge the person themselves twice: a decider who is the recorder is the ordinary case", () => {
    expect(deciderFaults(step, ctx({ requesterId: "hodNth", recorderId: "hodNth" })).faults).toEqual(["SELF_APPROVAL"]);
    expect(deciderFaults(step, ctx({ recorderId: "hodNth" })).faults).toEqual([]);
    expect(deciderFaults(step, ctx({ recorderId: null })).faults).toEqual([]);
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
    today: "2026-09-30", person: { id: "hodNth", isActive: true }, requesterId: "req", endorserIds: [] as string[], otherDeciderIds: [] as string[], earlier: NO_EARLIER_RECORDERS,
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

describe("an endorser holding the office's delegation for the same unit (round 3, item j)", () => {
  const step = { committeeCode: null, nonDelegable: false, decision: "PENDING" };
  it("is refused: a delegate who endorsed for the very unit the office is held for", () => {
    const holders = holdersFor("DEPT_HEAD", PATH, ROSTER, [delegation()], "2026-09-30");
    expect(holders.scope).toBe("NTH");
    const r = deciderFaults(step, {
      today: "2026-09-30", holders, person: { id: "deputy", isActive: true }, requesterId: "req", endorserIds: [], otherDeciderIds: [], earlier: NO_EARLIER_RECORDERS,
      earlierDone: true, decidedOn: "2026-09-30", openedOn: "2026-09-20", value: 3_800_000n,
      endorsements: [{ personId: "deputy", unitCode: "NTH" }],
    });
    expect(r.faults).toContain("ENDORSED_IT");
  });
});

describe("an endorser holding an organisation-wide office (ruling R1)", () => {
  const step = { committeeCode: null, nonDelegable: false, decision: "PENDING" };
  // The CEO office is held organisation-wide (no unit); GRP is the root of the path.
  const roster: Roster = {
    people: [person("ceo"), person("hod"), person("deputy")],
    offices: [],
    assignments: [assignment("c1", "ceo", "CEO", null), assignment("c2", "hod", "CEO", null)],
  };
  const base = {
    today: "2026-09-30", requesterId: "req", endorserIds: [] as string[], otherDeciderIds: [] as string[], earlier: NO_EARLIER_RECORDERS,
    earlierDone: true, decidedOn: "2026-09-30", openedOn: "2026-09-20", value: 3_800_000n, rootUnitCode: "GRP",
  };

  it("lets the company-tier endorser who holds the CEO office directly decide the CEO step", () => {
    const holders = holdersFor("CEO", PATH, roster, [], "2026-09-30");
    expect(holders.scope).toBeNull();
    const r = deciderFaults(step, { ...base, holders, person: { id: "ceo", isActive: true }, endorsements: [{ personId: "ceo", unitCode: "GRP" }] });
    expect(r.faults).toEqual([]);
  });

  it("refuses a department-tier endorser holding the organisation-wide office", () => {
    const holders = holdersFor("CEO", PATH, roster, [], "2026-09-30");
    const r = deciderFaults(step, { ...base, holders, person: { id: "hod", isActive: true }, endorsements: [{ personId: "hod", unitCode: "NTH" }] });
    expect(r.faults).toContain("ENDORSED_IT");
  });

  it("refuses a delegate of the organisation-wide office who endorsed at the root", () => {
    const d = { ...delegation(), fromPersonId: "ceo", toPersonId: "deputy", roleCode: "CEO" };
    const holders = holdersFor("CEO", PATH, roster, [d], "2026-09-30");
    const r = deciderFaults(step, { ...base, holders, person: { id: "deputy", isActive: true }, endorsements: [{ personId: "deputy", unitCode: "GRP" }] });
    expect(r.faults).toContain("ENDORSED_IT");
  });

  it("bars an organisation-wide holder who endorsed when the root is not known", () => {
    const holders = holdersFor("CEO", PATH, roster, [], "2026-09-30");
    const r = deciderFaults(step, { ...base, rootUnitCode: null, holders, person: { id: "ceo", isActive: true }, endorsements: [{ personId: "ceo", unitCode: "GRP" }] });
    expect(r.faults).toContain("ENDORSED_IT");
  });
});

describe("a declared conflict bars the declarer (FR-APR-009)", () => {
  it("refuses the person who recused, even where they hold the acting office", async () => {
    const { deciderFaults } = await import("./holders");
    const check = deciderFaults(
      { committeeCode: null, nonDelegable: false, decision: "PENDING" },
      {
        today: "2026-10-01",
        holders: { scope: null, holderIds: ["p1"], delegates: [] },
        person: { id: "p1", isActive: true },
        requesterId: "p9",
        endorserIds: [],
        otherDeciderIds: [], earlier: NO_EARLIER_RECORDERS,
        declaredConflictIds: ["p1"],
        earlierDone: true,
        decidedOn: "2026-10-01",
        openedOn: "2026-09-30",
        value: 100n,
      },
    );
    expect(check.faults).toEqual(["DECLARED_CONFLICT"]);
  });
});

describe("who is able to act for an office on the day (FR-APR-008, ruling R1)", () => {
  const all = () => true;
  it("counts holders and live delegates within their ceiling", () => {
    const h = holdersFor("DEPT_HEAD", PATH, ROSTER, [delegation({ valueCeiling: "10000.00" })], "2026-09-30");
    expect(ableToAct(h, "req", 1_000_000n, all)).toEqual({ holderIds: ["hodNth"], delegateIds: ["deputy"] });
    // RM10,000.01 is one sen over the delegate's ceiling.
    expect(ableToAct(h, "req", 1_000_001n, all)).toEqual({ holderIds: ["hodNth"], delegateIds: [] });
  });
  it("leaves out anyone not available, but never the requester", () => {
    const h = holdersFor("DEPT_HEAD", PATH, ROSTER, [delegation()], "2026-09-30");
    expect(ableToAct(h, "hodNth", 100n, (pid) => pid !== "hodNth" && pid !== "deputy")).toEqual({ holderIds: ["hodNth"], delegateIds: [] });
  });
});
