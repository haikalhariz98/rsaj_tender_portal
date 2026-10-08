import { describe, expect, it } from "vitest";

import {
  anyLineRecorded,
  chainAbove,
  directSubordinates,
  immediateSuperior,
  lineFaults,
  lineOf,
  REPORTING_LINE_NOT_SET,
  superiorsNote,
  type ReportingLine,
} from "./reporting-lines";

const day = (d: string) => new Date(`${d}T00:00:00Z`);
const L = (id: string, personId: string, superiorPersonId: string | null, from = "2026-01-01", to: string | null = null): ReportingLine => ({
  id,
  personId,
  superiorPersonId,
  effectiveFrom: day(from),
  effectiveTo: to ? day(to) : null,
});
const NOW = day("2026-10-01");
const name = (id: string) => id.toUpperCase();

describe("a reporting line has three states, never two (FR-APR-010, FR-APR-011)", () => {
  const lines = [L("1", "clerk", "head"), L("2", "head", null)];

  it("reads a person with no line as NOT SET, which is not the same as nobody above them", () => {
    expect(lineOf(lines, "stranger", NOW)).toEqual({ kind: "NOT_SET" });
    expect(lineOf(lines, "head", NOW)).toEqual({ kind: "TOP" });
    expect(lineOf(lines, "clerk", NOW)).toEqual({ kind: "SUPERIOR", superiorPersonId: "head" });
  });

  it("is empty as shipped: no line is assumed and none is derived", () => {
    expect(anyLineRecorded([])).toBe(false);
    expect(lineOf([], "clerk", NOW)).toEqual({ kind: "NOT_SET" });
    expect(immediateSuperior([], "clerk", NOW)).toBeNull();
  });

  it("reads a line only on the days it is in force, its end day not included", () => {
    const ended = [L("1", "clerk", "head", "2026-01-01", "2026-10-01")];
    expect(lineOf(ended, "clerk", day("2026-09-30")).kind).toBe("SUPERIOR");
    expect(lineOf(ended, "clerk", day("2026-10-01")).kind).toBe("NOT_SET");
  });

  it("does not guess between two lines in force on one day: that is NOT SET", () => {
    expect(lineOf([L("1", "clerk", "a"), L("2", "clerk", "b")], "clerk", NOW)).toEqual({ kind: "NOT_SET" });
  });

  it("lists the direct subordinates and the chain above, to the head of the line", () => {
    const org = [L("1", "clerk", "head"), L("2", "head", "director"), L("3", "director", null), L("4", "other", "head")];
    expect(directSubordinates(org, "head", NOW).sort()).toEqual(["clerk", "other"]);
    expect(chainAbove(org, "clerk", NOW)).toEqual({ chain: ["head", "director"], ends: "TOP" });
    expect(chainAbove([L("1", "clerk", "head")], "clerk", NOW)).toEqual({ chain: ["head"], ends: "NOT_SET" });
  });
});

describe("what is refused when a line is recorded", () => {
  it("refuses reporting to yourself", () => {
    expect(lineFaults(L("n", "a", "a"), [])).toContain("SELF");
  });

  it("refuses a loop: A above B above A, directly or through others", () => {
    expect(lineFaults(L("n", "a", "b"), [L("1", "b", "a")])).toContain("CYCLE");
    expect(lineFaults(L("n", "a", "c"), [L("1", "c", "b"), L("2", "b", "a")])).toContain("CYCLE");
    expect(lineFaults(L("n", "a", "b"), [L("1", "b", "c")])).toEqual([]);
  });

  it("refuses a loop that only appears on a later day, when another line begins inside the period", () => {
    const later = [L("1", "b", "a", "2027-01-01")];
    expect(lineFaults(L("n", "a", "b", "2026-01-01"), later)).toContain("CYCLE");
    // The other line ended before this one begins: no day on which both stand.
    expect(lineFaults(L("n", "a", "b", "2026-06-01"), [L("1", "b", "a", "2026-01-01", "2026-06-01")])).toEqual([]);
  });

  it("refuses a second line for a person over the same days, and a period that runs backwards", () => {
    expect(lineFaults(L("n", "a", "b", "2026-06-01"), [L("1", "a", "c", "2026-01-01")])).toContain("OVERLAPS_EXISTING");
    expect(lineFaults(L("n", "a", "b", "2026-06-01", "2026-06-01"), [])).toContain("ENDS_BEFORE_IT_STARTS");
  });

  it("lets an edit overlap itself", () => {
    expect(lineFaults(L("1", "a", "b"), [L("1", "a", "c")])).toEqual([]);
  });
});

describe("the words for an audit row or a notice (superiorsNote)", () => {
  it("says Reporting line not set when none is recorded, and names no one", () => {
    const n = superiorsNote([], ["h1"], NOW, name);
    expect(n.text).toContain(REPORTING_LINE_NOT_SET);
    expect(n.superiorIds).toEqual([]);
  });

  it("names the immediate superior of the holders when lines are recorded", () => {
    expect(superiorsNote([L("1", "h1", "boss")], ["h1"], NOW, name).text).toBe("Immediate superior on record: BOSS.");
  });

  it("says which holder has no line, beside the superior it can name", () => {
    const n = superiorsNote([L("1", "h1", "boss")], ["h1", "h2"], NOW, name);
    expect(n.text).toContain("Immediate superior on record: BOSS.");
    expect(n.text).toContain(`${REPORTING_LINE_NOT_SET} for H2.`);
  });
});
