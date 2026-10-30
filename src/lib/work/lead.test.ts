import { describe, expect, it } from "vitest";

import { leadIds } from "./lead";
import type { TeamMember } from "./types";

/** The lead (WS-3; 3b B-13, WB-7): the active Project manager, else the S.O. office's holders and acting holders today; nobody with neither. */

const so = { roleLabel: "S.O.", holderIds: ["nurul", "hafiz"], actingIds: ["aisyah", "nurul"] };
const ACTIVE = new Set(["nurul", "hafiz", "aisyah", "pm"]);
const pm: TeamMember = { role: "PROJECT_MANAGER", personId: "pm" };
const others: TeamMember[] = [
  { role: "SITE_ENGINEER", personId: "se" },
  { role: "CONTRACT_ADMINISTRATOR", personId: "ca" },
];

describe("leadIds: no Project manager, the S.O. (3a's W-4)", () => {
  it("the holders and those acting in the office, each once", () => {
    expect(leadIds([], so, "2026-11-05", ACTIVE)).toEqual(["aisyah", "hafiz", "nurul"]);
  });
  it("no S.O. in force: no lead", () => {
    expect(leadIds([], null, "2026-11-05", ACTIVE)).toEqual([]);
  });
  it("no time zone: no today, so no lead, even with an office", () => {
    expect(leadIds([], so, null, ACTIVE)).toEqual([]);
  });
  it("an office with nobody in it today: no lead", () => {
    expect(leadIds([], { roleLabel: "S.O.", holderIds: [], actingIds: [] }, "2026-11-05", ACTIVE)).toEqual([]);
  });
  it("team members in other roles are never the lead", () => {
    expect(leadIds(others, so, "2026-11-05", new Set([...ACTIVE, "se", "ca"]))).toEqual(["aisyah", "hafiz", "nurul"]);
    expect(leadIds(others, null, "2026-11-05", new Set(["se", "ca"]))).toEqual([]);
  });
});

describe("leadIds: a named Project manager", () => {
  it("is the lead alone, over the S.O.", () => {
    expect(leadIds([...others, pm], so, "2026-11-05", ACTIVE)).toEqual(["pm"]);
  });
  it("needs no time zone and no S.O.", () => {
    expect(leadIds([pm], null, null, ACTIVE)).toEqual(["pm"]);
  });
  it("no longer active: not the lead, and the lead falls back to the S.O. (WB-7)", () => {
    const gone = new Set(["nurul", "hafiz", "aisyah"]);
    expect(leadIds([pm], so, "2026-11-05", gone)).toEqual(["aisyah", "hafiz", "nurul"]);
    expect(leadIds([pm], so, null, gone)).toEqual([]);
  });
});
