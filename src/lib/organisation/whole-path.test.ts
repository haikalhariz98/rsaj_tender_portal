import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { openingFindingText } from "@/lib/opening/labels";
import { panelFaults, type PanelPick } from "@/lib/opening/panel";

import { UNITS } from "./fixture";
import { buildStructure, pathTo, wholePathTo } from "./structure";

/**
 * Phase 2 close-out 67-C5: `pathTo` stops at the first ancestor not in force, so a unit under a retired
 * unit gets a path cut short. The structure allows that shape: a unit's parent is checked only when the
 * unit is created, and nothing stops the parent being retired afterwards (the fixture's dept_orphan
 * under div_gone, which `buildStructure` reports as detached). The independence rule (6.7, FR-CTE-011)
 * therefore reads `wholePathTo`: the whole way up in force, or no path, which it blocks as a unit not
 * in the structure — never "not under the excluded unit".
 */

const NOW = new Date("2026-06-01");
const BEFORE = new Date("2025-06-01");
const codes = (units: { code: string }[]) => units.map((u) => u.code);

describe("the whole path to a unit (67-C5)", () => {
  it("is pathTo's path when every unit up to the top is in force", () => {
    expect(codes(wholePathTo(UNITS, "sect_a1x", NOW))).toEqual(codes(pathTo(UNITS, "sect_a1x", NOW)));
    expect(codes(wholePathTo(UNITS, "co", NOW))).toEqual(["co"]);
  });

  it("is none where a unit above is not in force, where pathTo cuts it short", () => {
    expect(codes(pathTo(UNITS, "dept_orphan", NOW))).toEqual(["dept_orphan"]);
    expect(wholePathTo(UNITS, "dept_orphan", NOW)).toEqual([]);
    expect(codes(wholePathTo(UNITS, "dept_orphan", BEFORE))).toEqual(["co", "div_gone", "dept_orphan"]);
  });

  it("is none for a unit not in force, and for a loop", () => {
    expect(wholePathTo(UNITS, "sect_future", NOW)).toEqual([]);
    expect(wholePathTo(UNITS, "loop_x", NOW)).toEqual([]);
    expect(wholePathTo(UNITS, "no_such_unit", NOW)).toEqual([]);
  });

  it("the shape is reachable: the structure in force reports the unit under a retired one as detached", () => {
    const s = buildStructure(UNITS, NOW);
    expect(JSON.stringify(s.faults)).toMatch(/dept_orphan/);
  });
});

describe("the independence rule on a broken path (67-C5)", () => {
  const seats = [
    { personId: "p1", committeeMemberId: "s1", seatLabel: "Chair" },
    { personId: "p2", committeeMemberId: "s2", seatLabel: "Member" },
  ];
  const pick = (personId: string, orgUnitCode: string): PanelPick => ({ personId, name: `Person ${personId}`, present: true, active: true, orgUnitCode });
  // The excluded unit is the company: everyone under it is excluded, so only a broken path could let a member through.
  const rule = (unitPath: (c: string) => readonly string[]) => (picked: PanelPick[]) =>
    panelFaults({ committeeCode: "OPENING", committee: { name: "Opening Committee" }, seats, override: null, unitPath, picked, policy: { panelSize: 2, exclusionRule: true, excludedUnitCode: "co" } })
      .filter((f) => f.level === "block");

  it("pathTo's cut-short path would let a member of a unit under the excluded one through", () => {
    const cutShort = rule((c) => codes(pathTo(UNITS, c, NOW)));
    expect(cutShort([pick("p1", "dept_orphan"), pick("p2", "sect_a1x")]).map((f) => f.code)).toEqual(["MEMBER_IN_EXCLUDED_UNIT"]);
  });

  it("the whole path blocks it as a unit not in the structure in force, and says a unit above may be why", () => {
    const whole = rule((c) => codes(wholePathTo(UNITS, c, NOW)));
    const fs = whole([pick("p1", "dept_orphan"), pick("p2", "sect_a1x")]);
    expect(fs.map((f) => f.code)).toEqual(["UNIT_NOT_RECORDED", "MEMBER_IN_EXCLUDED_UNIT"]);
    expect(openingFindingText(fs[0])).toBe(
      "Person p1's unit is not in the structure in force. Correct it under Configuration › Users or Configuration › Organisation.",
    );
  });

  it("the opening reads the whole path (source scan)", () => {
    const src = readFileSync(join(process.cwd(), "src/lib/opening/repo.ts"), "utf8");
    expect(src).toMatch(/unitPath: \(code: string\) => \(on \? wholePathTo\(units, code, on\)\.map\(\(u\) => u\.code\) : \[\]\)/);
    expect(src).not.toMatch(/\bpathTo\(/);
  });
});
