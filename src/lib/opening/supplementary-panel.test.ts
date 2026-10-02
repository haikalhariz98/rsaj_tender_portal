import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { openingFindingText } from "./labels";
import { panelFaults, supplementaryPanel, type PanelCommittee } from "./panel";

/**
 * Review R-3 (BD-67-11): a supplementary opening is held by the main opening's committee — the one
 * frozen on it — never the one the method names when the late tender is opened; that committee's
 * panel rules are read fresh when the supplementary opening starts.
 */

const tenderBoard: PanelCommittee = { code: "OPENING_A", nameEn: "Opening Committee A", retiredOn: null, panelSize: 2, panelExclusionRule: false, panelExcludesUnitCode: null };
const seats = [
  { personId: "p1", committeeMemberId: "s1", seatLabel: "Chair" },
  { personId: "p2", committeeMemberId: "s2", seatLabel: "Member" },
];
const unitPath = (c: string) => [c];
const pick = (personId: string) => ({ personId, name: personId, present: true, active: true, orgUnitCode: "FIN" });

describe("the supplementary opening's panel (R-3)", () => {
  it("is judged against the main opening's committee, by the code frozen on it", () => {
    const r = supplementaryPanel({ mainCommittee: tenderBoard, frozenCode: "OPENING_A", seats, unitPath });
    expect(r).toMatchObject({ committeeCode: "OPENING_A", committee: { name: "Opening Committee A" }, seats });
    if ("fault" in r) throw new Error("unexpected");
    expect(panelFaults({ ...r, picked: [pick("p1"), pick("p2")], override: null })).toEqual([]);
  });
  it("its panel rules are the committee's now: a size changed since the main opening applies (BD-67-11)", () => {
    const r = supplementaryPanel({ mainCommittee: { ...tenderBoard, panelSize: 3 }, frozenCode: "OPENING_A", seats, unitPath });
    if ("fault" in r) throw new Error("unexpected");
    expect(panelFaults({ ...r, picked: [pick("p1"), pick("p2")], override: null }).map((f) => f.code)).toEqual(["PANEL_SIZE_DIFFERS"]);
  });
  it("a member of the committee the method names now, but not of the main opening's, is not on it", () => {
    const r = supplementaryPanel({ mainCommittee: tenderBoard, frozenCode: "OPENING_A", seats, unitPath });
    if ("fault" in r) throw new Error("unexpected");
    expect(panelFaults({ ...r, picked: [pick("p1"), pick("x9")], override: null }).map((f) => f.code)).toEqual(["NOT_ON_COMMITTEE"]);
  });
  it("the main opening's committee retired or gone: MAIN_COMMITTEE_GONE, never another committee", () => {
    expect(supplementaryPanel({ mainCommittee: { ...tenderBoard, retiredOn: new Date("2026-11-20") }, frozenCode: "OPENING_A", seats, unitPath })).toEqual({ fault: { code: "MAIN_COMMITTEE_GONE", level: "block" } });
    expect(supplementaryPanel({ mainCommittee: null, frozenCode: "OPENING_A", seats, unitPath })).toEqual({ fault: { code: "MAIN_COMMITTEE_GONE", level: "block" } });
    expect(openingFindingText({ code: "MAIN_COMMITTEE_GONE", level: "block" })).toMatch(/does not take its place/);
  });
  it("startSupplementaryOpening reads the main opening's committee and seats, never the method's now", () => {
    const src = readFileSync("src/app/sourcing/[id]/opening/actions.ts", "utf8");
    const body = src.slice(src.indexOf("export async function startSupplementaryOpening"), src.indexOf("export async function recordAuthorisation"));
    expect(body).toMatch(/supplementaryPanel\(\{ mainCommittee: committee, frozenCode: mainPolicy\.committee\.code, seats: c\.mainSeats/);
    expect(body).not.toMatch(/c\.committee\b|c\.seats\b|c\.method\?\.openingCommitteeCode/);
    const repo = readFileSync("src/lib/opening/repo.ts", "utf8");
    expect(repo).toMatch(/id: mainRow\.committeeId/);
  });
});
