import { describe, expect, it } from "vitest";

import { snapshotFaults } from "@/lib/certificate/snapshot";

import { eotSnapshot } from "./certificate";

/** The EOT certificate's figures (design note §6.6): sound, no money, nothing overridable. */

const base = { today: "2026-10-20", scope: "WHOLE" as const, sectionRef: null, previous: "2026-08-31", granted: 30, computed: 28, next: "2026-09-30", unextendedNote: "" };

describe("eotSnapshot", () => {
  it("is a sound snapshot with the five figures, none money and none overridable", () => {
    const s = eotSnapshot(base);
    expect(snapshotFaults(s)).toEqual([]);
    expect(s.lines.map((l) => [l.key, l.value])).toEqual([["eotScope", "The whole works"], ["eotPreviousCompletion", "2026-08-31"], ["eotGrantedDays", "30"], ["eotComputedDays", "28"], ["eotNewCompletion", "2026-09-30"]]);
    expect(s.lines.every((l) => !l.overridable)).toBe(true);
    expect(s.lines.some((l) => l.type === "MONEY") || s.totals.length > 0).toBe(false);
  });
  it("carries the period not extended where one is stated, and names the section", () => {
    const s = eotSnapshot({ ...base, scope: "SECTION", sectionRef: "S2", unextendedNote: "Four days of the contractor's own delay." });
    expect(snapshotFaults(s)).toEqual([]);
    expect(s.lines[0].value).toBe("Section S2");
    expect(s.lines.at(-1)).toMatchObject({ key: "eotUnextended", value: "Four days of the contractor's own delay." });
  });
});
