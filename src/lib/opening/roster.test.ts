import { describe, expect, it } from "vitest";

import { addOfficerFaults, controlledChangeFaults, isListFault, rosterChange, rosterFaults, type RosterInput, type RosterOfficer } from "./roster";
import { incomingRefusal, rosterActs } from "./roster-labels";

/**
 * SR-07 (ruling 11): the officers named on an exercise to open its bids. The number is the committee's panel size, never a literal; an
 * unset size refuses saying so; each officer holds a seat, is distinct, active, outside an excluded unit, and is not an administrator.
 */

const seats = [
  { personId: "p1", committeeMemberId: "s1", seatLabel: "Chair" },
  { personId: "p2", committeeMemberId: "s2", seatLabel: "Member" },
  { personId: "p3", committeeMemberId: "s3", seatLabel: "Member" },
];
const officer = (personId: string, over: Partial<RosterOfficer> = {}): RosterOfficer => ({ personId, name: `Person ${personId}`, active: true, orgUnitCode: "FIN", administrator: false, ...over });
const policy = { panelSize: 2, exclusionRule: false, excludedUnitCode: null };
const base: RosterInput = { committeeCode: "OPENING", committee: { name: "Opening Committee" }, seats, officers: [officer("p1"), officer("p2")], policy, unitPath: (c) => (c === "CP-SEC" ? ["CP-SEC", "CP"] : [c]) };
const codes = (x: RosterInput) => rosterFaults(x).map((f) => f.code);

describe("the roster (SR-07)", () => {
  it("passes with exactly the committee's number of distinct officers who hold its seats", () => expect(codes(base)).toEqual([]));

  it("the number is the committee's, never two: size 3 needs three, size 1 needs one", () => {
    expect(codes({ ...base, policy: { ...policy, panelSize: 3 } })).toEqual(["OFFICERS_SHORT"]);
    expect(codes({ ...base, policy: { ...policy, panelSize: 1 } })).toEqual(["OFFICERS_TOO_MANY"]);
    expect(codes({ ...base, officers: [officer("p1")], policy: { ...policy, panelSize: 1 } })).toEqual([]);
    expect(codes({ ...base, officers: [officer("p1"), officer("p2"), officer("p3")], policy: { ...policy, panelSize: 3 } })).toEqual([]);
  });

  it("an unset size is not a size of zero: PANEL_SIZE_NOT_SET, and nobody is certified under it", () => {
    expect(codes({ ...base, policy: { ...policy, panelSize: null } })).toEqual(["PANEL_SIZE_NOT_SET"]);
    expect(codes({ ...base, officers: [], policy: { ...policy, panelSize: null } })).toEqual(["PANEL_SIZE_NOT_SET"]);
  });

  it("none named under a set size: short, with the count the words use", () => {
    const f = rosterFaults({ ...base, officers: [] });
    expect(f.map((x) => x.code)).toEqual(["OFFICERS_SHORT"]);
    expect(f[0].data).toEqual({ required: 2, named: 0 });
  });

  it("the method's committee unset or gone is said before anything else", () => {
    expect(codes({ ...base, committeeCode: null })).toEqual(["COMMITTEE_NOT_SET"]);
    expect(codes({ ...base, committee: null })).toEqual(["COMMITTEE_NOT_FOUND"]);
  });

  it("someone with no seat on the committee, the same person twice, or an inactive one is refused", () => {
    expect(codes({ ...base, officers: [officer("p1"), officer("x9")] })).toEqual(["NOT_ON_COMMITTEE"]);
    expect(codes({ ...base, officers: [officer("p1"), officer("p1")] })).toContain("PICKED_TWICE");
    expect(codes({ ...base, officers: [officer("p1"), officer("p2", { active: false })] })).toEqual(["PERSON_INACTIVE"]);
  });

  it("a person who administers is refused (NFR-SEC-004), naming them", () => {
    const f = rosterFaults({ ...base, officers: [officer("p1"), officer("p2", { administrator: true })] });
    expect(f.map((x) => x.code)).toEqual(["OFFICER_IS_ADMINISTRATOR"]);
    expect(f[0].data).toEqual({ person: "Person p2" });
  });

  it("the independence rule: on, a member of the excluded unit, or of a unit under it, or of none recorded, is refused", () => {
    const on = { ...policy, exclusionRule: true, excludedUnitCode: "CP" };
    expect(codes({ ...base, policy: on })).toEqual([]);
    expect(codes({ ...base, policy: on, officers: [officer("p1"), officer("p2", { orgUnitCode: "CP-SEC" })] })).toEqual(["MEMBER_IN_EXCLUDED_UNIT"]);
    expect(codes({ ...base, policy: on, officers: [officer("p1"), officer("p2", { orgUnitCode: null })] })).toEqual(["UNIT_NOT_RECORDED"]);
    expect(codes({ ...base, policy: { ...policy, exclusionRule: true, excludedUnitCode: null } })).toEqual(["EXCLUDED_UNIT_NOT_SET"]);
  });

  it("the rule unset warns that the officers are not checked for independence, and does not refuse", () => {
    const f = rosterFaults({ ...base, policy: { ...policy, exclusionRule: null } });
    expect(f.map((x) => [x.code, x.level])).toEqual([["EXCLUSION_RULE_NOT_SET", "warn"]]);
  });

  it("presence and an override of another size are the table's, not the list's", () => {
    // The panel would say FEWER_THAN_TWO_PRESENT or ask an override for a size of one; the roster says neither.
    expect(codes({ ...base, officers: [officer("p1")], policy: { ...policy, panelSize: 1 } })).toEqual([]);
  });
});

describe("naming one more officer", () => {
  it("is allowed while the list is still short, and refused past the number or for a person who cannot sit", () => {
    expect(addOfficerFaults({ ...base, officers: [] }, officer("p1")).map((f) => f.code)).toEqual([]);
    expect(addOfficerFaults(base, officer("p3")).map((f) => f.code)).toEqual(["OFFICERS_TOO_MANY"]);
    expect(addOfficerFaults({ ...base, officers: [officer("p1")] }, officer("p2", { administrator: true })).map((f) => f.code)).toEqual(["OFFICER_IS_ADMINISTRATOR"]);
    expect(addOfficerFaults({ ...base, officers: [officer("p1")] }, officer("p1")).map((f) => f.code)).toContain("PICKED_TWICE");
  });
  // SR-07 (ruling 11): replacing one officer never re-judges the one who stays, or the roster could lock for good.
  it("judges the incoming person only: an officer who stays and holds no seat does not block a replacement", () => {
    const stranded = { ...base, officers: [officer("x1"), officer("x2")] };
    const without = (id: string) => ({ ...stranded, officers: stranded.officers.filter((o) => o.personId !== id) });
    expect(rosterFaults(stranded).map((f) => f.code)).toContain("NOT_ON_COMMITTEE");
    expect(addOfficerFaults(without("x1"), officer("p1"))).toEqual([]);
    expect(addOfficerFaults(without("x2"), officer("p2"))).toEqual([]);
  });
  it("several replacements can follow one another", () => {
    let officers = [officer("x1"), officer("x2")];
    for (const [out, inn] of [["x1", "p1"], ["x2", "p2"]] as const) {
      const rest = officers.filter((o) => o.personId !== out);
      expect(addOfficerFaults({ ...base, officers: rest }, officer(inn))).toEqual([]);
      officers = [...rest, officer(inn)];
    }
    expect(codes({ ...base, officers })).toEqual([]);
  });
  it("still refuses an incoming person who cannot sit, is named twice, or would be one too many", () => {
    expect(addOfficerFaults({ ...base, officers: [officer("x1")] }, officer("x9")).map((f) => f.code)).toEqual(["NOT_ON_COMMITTEE"]);
    expect(addOfficerFaults({ ...base, officers: [officer("p1")] }, officer("p3", { active: false })).map((f) => f.code)).toEqual(["PERSON_INACTIVE"]);
    expect(addOfficerFaults({ ...base, officers: [officer("x1")] }, officer("x1")).map((f) => f.code)).toContain("PICKED_TWICE");
    expect(addOfficerFaults(base, officer("p3")).map((f) => f.code)).toEqual(["OFFICERS_TOO_MANY"]);
  });
  it("tells list-wide findings from the person's own", () => {
    expect(isListFault("PANEL_SIZE_NOT_SET")).toBe(true);
    expect(isListFault("NOT_ON_COMMITTEE")).toBe(false);
  });
  it("is refused while the committee's size is not set", () => {
    expect(addOfficerFaults({ ...base, officers: [], policy: { ...policy, panelSize: null } }, officer("p1")).map((f) => f.code)).toEqual(["PANEL_SIZE_NOT_SET"]);
  });
});

describe("changing the roster (ruling 11)", () => {
  const now = new Date("2026-10-20T09:00:00Z");
  const closing = new Date("2026-10-29T06:30:00Z");
  const at = (status: string, over: { closing?: Date | null; openingStarted?: boolean } = {}) => rosterChange({ status, closing, now, openingStarted: false, ...over });

  it("before the documents are submitted it is an ordinary edit", () => {
    expect(at("DRAFT")).toEqual({ change: "FREE", fault: null });
    expect(at("DOCUMENTS_IN_PREPARATION")).toEqual({ change: "FREE", fault: null });
  });
  it("from submission to the closing it is a controlled change", () => {
    for (const s of ["PENDING_APPROVAL_FOR_TENDERING", "APPROVED_FOR_TENDERING", "ADVERTISED", "INVITED"]) expect(at(s)).toEqual({ change: "CONTROLLED", fault: null });
  });
  it("at the closing and after it there is no substitution", () => {
    expect(at("ADVERTISED", { closing: now })).toEqual({ change: "REFUSED", fault: "AFTER_CLOSING" });
    expect(at("ADVERTISED", { closing: new Date("2026-10-01T00:00:00Z") })).toEqual({ change: "REFUSED", fault: "AFTER_CLOSING" });
  });
  it("once the opening has started, or the exercise is cancelled, nothing changes", () => {
    expect(at("OPENING_IN_PROGRESS", { openingStarted: true }).fault).toBe("OPENING_STARTED");
    expect(at("CANCELLED").fault).toBe("EXERCISE_CANCELLED");
  });
  it("a controlled change names its authority and its reason", () => {
    expect(controlledChangeFaults({ authority: "", reason: "" }).map((f) => f.code)).toEqual(["AUTHORITY_REQUIRED", "REASON_REQUIRED"]);
    expect(controlledChangeFaults({ authority: "Board minute 4", reason: "On leave" })).toEqual([]);
  });
});

describe("what the Opening officers card offers (rosterActs)", () => {
  const base = { change: { change: "FREE" as const, fault: null }, committeeReady: true, size: 2, named: 1, candidates: 3, nameRefusal: null };
  it("before submission: name while short, replace and take off always", () => {
    const a = rosterActs(base);
    expect(a.name).toEqual({ allowed: true });
    expect(a.remove).toEqual({ allowed: true });
    expect(a.substitute).toEqual({ allowed: true, controlled: false });
  });
  it("full: naming says all are named, in the committee's number", () => {
    const a = rosterActs({ ...base, named: 2 });
    expect(a.name.allowed).toBe(false);
    expect(a.name.allowed === false && a.name.reason).toMatch(/All 2 opening officers are named/);
    expect(rosterActs({ ...base, size: 1, named: 1 }).name).toMatchObject({ allowed: false, reason: expect.stringMatching(/The one opening officer is named/) });
  });
  it("an unset committee or size withholds naming with the place to put it right, not a zero", () => {
    expect(rosterActs({ ...base, committeeReady: false }).name).toMatchObject({ allowed: false, reason: expect.stringMatching(/Reference data/) });
    expect(rosterActs({ ...base, size: null }).name).toMatchObject({ allowed: false, reason: expect.stringMatching(/number of opening officers is not set/) });
  });
  it("after submission and before the closing only a controlled replacement is offered", () => {
    const a = rosterActs({ ...base, change: { change: "CONTROLLED", fault: null } });
    expect(a.name.allowed).toBe(false);
    expect(a.remove.allowed).toBe(false);
    expect(a.substitute).toEqual({ allowed: true, controlled: true });
  });
  it("after the closing nothing is offered and the re-tender wording is said", () => {
    const a = rosterActs({ ...base, change: { change: "REFUSED", fault: "AFTER_CLOSING" } });
    for (const act of [a.name, a.remove, a.substitute]) expect(act).toMatchObject({ allowed: false, reason: expect.stringMatching(/re-tendered/) });
  });
  it("the naming rule's refusal is carried (an administrator account, or not named on the exercise)", () => {
    expect(rosterActs({ ...base, nameRefusal: "An administrator account does not name people." }).name).toMatchObject({ allowed: false, reason: "An administrator account does not name people." });
  });
});

describe("a naming refusal withholds taking an officer off too (the action asks the same rule)", () => {
  const free = { change: { change: "FREE" as const, fault: null }, committeeReady: true, size: 2, named: 1, candidates: 3, nameRefusal: null };
  it("with the reason the naming rule gave", () => {
    const a = rosterActs({ ...free, nameRefusal: "You are not named on this exercise." });
    expect(a.remove).toEqual({ allowed: false, reason: "You are not named on this exercise." });
  });
});

describe("where a refusal of the incoming officer is put (incomingRefusal)", () => {
  const f = (code: string, level: "block" | "warn" = "block", data?: Record<string, string>) => ({ code, level, ...(data ? { data } : {}) });
  it("the person's own faults go to the person field", () => {
    expect(incomingRefusal([f("NOT_ON_COMMITTEE", "block", { person: "Aida" })])).toEqual({ personId: expect.stringContaining("Aida") });
    expect(incomingRefusal([f("PICKED_TWICE", "block", { person: "Aida" })])).toEqual({ personId: expect.any(String) });
  });
  it("the list's faults (committee, number, independence rule) are the form's message, not the person's", () => {
    for (const code of ["COMMITTEE_NOT_SET", "PANEL_SIZE_NOT_SET", "OFFICERS_TOO_MANY", "EXCLUDED_UNIT_NOT_SET"]) {
      const r = incomingRefusal([f(code, "block", { required: "2", named: "3" })]);
      expect(r?.message, code).toEqual(expect.any(String));
      expect(r?.personId, code).toBeUndefined();
    }
  });
  it("both at once are split, and a warning refuses nothing", () => {
    expect(Object.keys(incomingRefusal([f("PANEL_SIZE_NOT_SET"), f("PERSON_INACTIVE", "block", { person: "Aida" })])!).sort()).toEqual(["message", "personId"]);
    expect(incomingRefusal([f("EXCLUSION_RULE_NOT_SET", "warn")])).toBeNull();
    expect(incomingRefusal([])).toBeNull();
  });
});
