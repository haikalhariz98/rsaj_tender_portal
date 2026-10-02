import { describe, expect, it } from "vitest";

import { independenceState, panelFaults, type PanelPick } from "./panel";

/**
 * FR-OPN-001, 002, FR-CTE-011 (C-6): the panel is picked from the committee's seats in force on the
 * day; its size is the committee's, no default; another size needs an override; the independence
 * rule is the committee's, and unset warns "panel not checked" rather than blocking.
 */

const seats = [
  { personId: "p1", committeeMemberId: "s1", seatLabel: "Chair" },
  { personId: "p2", committeeMemberId: "s2", seatLabel: "Member" },
  { personId: "p3", committeeMemberId: "s3", seatLabel: "Member" },
];
const pick = (personId: string, over: Partial<PanelPick> = {}): PanelPick => ({ personId, name: `Person ${personId}`, present: true, active: true, orgUnitCode: "FIN", ...over });
const policy = { panelSize: 2, exclusionRule: false, excludedUnitCode: null };
const base = { committeeCode: "OPENING", committee: { name: "Opening Committee" }, seats, picked: [pick("p1"), pick("p2")], policy, override: null, unitPath: (c: string) => (c === "CP-SEC" ? ["CP-SEC", "CP"] : [c]) };
const codes = (x: Parameters<typeof panelFaults>[0]) => panelFaults(x).filter((f) => f.level === "block").map((f) => f.code);
const all = (x: Parameters<typeof panelFaults>[0]) => panelFaults(x).map((f) => f.code);

describe("the panel (FR-OPN-001, 002)", () => {
  it("passes with two members of the committee present, of its size", () => expect(all(base)).toEqual([]));
  it("the method's committee unset: COMMITTEE_NOT_SET; named but gone: COMMITTEE_NOT_FOUND", () => {
    expect(codes({ ...base, committeeCode: null })).toEqual(["COMMITTEE_NOT_SET"]);
    expect(codes({ ...base, committee: null })).toEqual(["COMMITTEE_NOT_FOUND"]);
  });
  it("the size unset blocks: PANEL_SIZE_NOT_SET, never a default of two", () => {
    expect(codes({ ...base, policy: { ...policy, panelSize: null } })).toEqual(["PANEL_SIZE_NOT_SET"]);
  });
  it("size 2 with 3 picked: PANEL_SIZE_DIFFERS; passes with authority, reason and a Person, warned", () => {
    const three = { ...base, picked: [pick("p1"), pick("p2"), pick("p3")] };
    expect(codes(three)).toEqual(["PANEL_SIZE_DIFFERS"]);
    expect(codes({ ...three, override: { authority: "", reason: "", personId: null, personActive: false } })).toEqual(["OVERRIDE_AUTHORITY_REQUIRED", "OVERRIDE_REASON_REQUIRED", "OVERRIDE_PERSON_REQUIRED"]);
    const ok = { ...three, override: { authority: "Board minute 4/2026", reason: "A third officer to read the bills", personId: "p9", personActive: true } };
    expect(codes(ok)).toEqual([]);
    expect(all(ok)).toEqual(["PANEL_SIZE_OVERRIDDEN"]);
  });
  it("a person holding no seat on the day: NOT_ON_COMMITTEE; picked twice or inactive refused", () => {
    expect(codes({ ...base, picked: [pick("p1"), pick("x9")] })).toEqual(["NOT_ON_COMMITTEE"]);
    expect(codes({ ...base, picked: [pick("p1"), pick("p1")] })).toContain("PICKED_TWICE");
    expect(codes({ ...base, picked: [pick("p1"), pick("p2", { active: false })] })).toEqual(["PERSON_INACTIVE"]);
  });
  it("fewer than two present cannot open the box; an absent member is warned", () => {
    const f = panelFaults({ ...base, picked: [pick("p1"), pick("p2", { present: false })] });
    expect(f.filter((x) => x.level === "block").map((x) => x.code)).toEqual(["FEWER_THAN_TWO_PRESENT"]);
    expect(f.find((x) => x.code === "MEMBER_ABSENT")?.level).toBe("warn");
  });
  it("nobody picked: PANEL_EMPTY", () => expect(codes({ ...base, picked: [] })).toEqual(["PANEL_EMPTY"]));
});

describe("the independence rule (FR-CTE-011, C-6)", () => {
  const rule = (exclusionRule: boolean | null, excludedUnitCode: string | null = "CP") => ({ ...policy, exclusionRule, excludedUnitCode });
  it("on, with unit X and a member of X (or a unit under it): MEMBER_IN_EXCLUDED_UNIT", () => {
    expect(codes({ ...base, policy: rule(true), picked: [pick("p1", { orgUnitCode: "CP" }), pick("p2")] })).toEqual(["MEMBER_IN_EXCLUDED_UNIT"]);
    expect(codes({ ...base, policy: rule(true), picked: [pick("p1", { orgUnitCode: "CP-SEC" }), pick("p2")] })).toEqual(["MEMBER_IN_EXCLUDED_UNIT"]);
    expect(codes({ ...base, policy: rule(true) })).toEqual([]);
  });
  it("on, a member's unit not recorded: UNIT_NOT_RECORDED blocks", () => {
    expect(codes({ ...base, policy: rule(true), picked: [pick("p1", { orgUnitCode: null }), pick("p2")] })).toEqual(["UNIT_NOT_RECORDED"]);
  });
  it("on, naming no unit: EXCLUDED_UNIT_NOT_SET", () => expect(codes({ ...base, policy: rule(true, null) })).toEqual(["EXCLUDED_UNIT_NOT_SET"]));
  it("off: passes whatever the units", () => expect(all({ ...base, policy: rule(false), picked: [pick("p1", { orgUnitCode: "CP" }), pick("p2", { orgUnitCode: null })] })).toEqual([]));
  it("unset: assigned with the warning, never blocking (C-6)", () => {
    const f = panelFaults({ ...base, policy: rule(null) });
    expect(f).toEqual([{ code: "EXCLUSION_RULE_NOT_SET", level: "warn" }]);
    expect(independenceState(null)).toBe("NOT_SET");
    expect(independenceState(true)).toBe("CHECKED");
  });
});
