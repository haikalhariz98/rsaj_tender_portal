import { describe, expect, it } from "vitest";

import { openingFindingText } from "./labels";
import { panelFaults, type PanelPick } from "./panel";

/**
 * Review R-6 (C-6, FR-CTE-011): with the independence rule on, a member whose unit is not in the
 * organisation's structure in force on the opening day cannot be checked, so it blocks as a unit not
 * recorded — never passes as "not in the excluded unit".
 */

const seats = [
  { personId: "p1", committeeMemberId: "s1", seatLabel: "Chair" },
  { personId: "p2", committeeMemberId: "s2", seatLabel: "Member" },
];
const pick = (personId: string, orgUnitCode: string | null): PanelPick => ({ personId, name: `Person ${personId}`, present: true, active: true, orgUnitCode });
// The structure in force: FIN, CP and CP-SEC under CP. "OLD" was retired; "TYPO" never existed.
const structure: Record<string, string[]> = { FIN: ["FIN"], CP: ["CP"], "CP-SEC": ["CP", "CP-SEC"] };
const unitPath = (c: string) => structure[c] ?? [];
const base = { committeeCode: "OPENING", committee: { name: "Opening Committee" }, seats, override: null, unitPath, policy: { panelSize: 2, exclusionRule: true, excludedUnitCode: "CP" } };
const codes = (picked: PanelPick[]) => panelFaults({ ...base, picked }).filter((f) => f.level === "block").map((f) => f.code);

describe("a unit outside the structure in force (R-6)", () => {
  it("a retired or unknown unit blocks as not recorded", () => {
    expect(codes([pick("p1", "OLD"), pick("p2", "FIN")])).toEqual(["UNIT_NOT_RECORDED"]);
    expect(codes([pick("p1", "TYPO"), pick("p2", "FIN")])).toEqual(["UNIT_NOT_RECORDED"]);
  });
  it("its words say why, and where to correct it", () => {
    const f = panelFaults({ ...base, picked: [pick("p1", "OLD"), pick("p2", "FIN")] }).find((x) => x.code === "UNIT_NOT_RECORDED")!;
    expect(openingFindingText(f)).toMatch(/^Person p1's unit is not in the organisation's structure in force on the opening day/);
    expect(openingFindingText({ code: "UNIT_NOT_RECORDED", level: "block", data: { person: "Aminah" } })).toMatch(/unit is not recorded/);
  });
  it("units in force are judged as before: outside passes, inside or under is refused", () => {
    expect(codes([pick("p1", "FIN"), pick("p2", "FIN")])).toEqual([]);
    expect(codes([pick("p1", "CP-SEC"), pick("p2", "FIN")])).toEqual(["MEMBER_IN_EXCLUDED_UNIT"]);
  });
  it("with the rule off, nothing is asked of units", () => {
    expect(panelFaults({ ...base, policy: { ...base.policy, exclusionRule: false }, picked: [pick("p1", "OLD"), pick("p2", null)] })).toEqual([]);
  });
});
