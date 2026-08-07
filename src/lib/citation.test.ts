import { describe, expect, it } from "vitest";

import rawRules from "../../prisma/seed-data/rsaj-dal-rules.json";
import { clauseOrGap, formatClause } from "./citation";

describe("clause citations", () => {
  it.each([
    ["DAL_3144_16", "DAL §3.1.4.4 item 16"],
    ["DAL_3143_9", "DAL §3.1.4.3 item 9"],
    ["DAL_3143_1", "DAL §3.1.4.3 item 1"],
    ["DAL_31422", "DAL §3.1.4.2 item 2"],
    ["DAL_3141", "DAL §3.1.4.1"],
    ["DAL_16", "DAL §1.6"],
    ["DAL_P17_CAPEX", "DAL p.17"],
    ["DAL_P40_VEHICLE", "DAL p.40"],
    ["DAL_ABSENCE", "DAL §1.6"],
  ])("renders %s as %s", (slug, expected) => {
    expect(formatClause(slug)).toBe(expected);
  });

  it("returns null for a gap marker rather than inventing a citation", () => {
    expect(formatClause("GAP_RETENTION_TENDER")).toBeNull();
    expect(formatClause("SK011_ADVANCE_GAP")).toBeNull();
  });

  it("returns null for nothing at all", () => {
    expect(formatClause(null)).toBeNull();
    expect(formatClause("")).toBeNull();
  });

  it("says so plainly when a matter has no governing clause", () => {
    expect(clauseOrGap("GAP_RETENTION_TENDER", true)).toBe("No governing clause");
    expect(clauseOrGap("DAL_3141", false)).toBe("DAL §3.1.4.1");
  });

  // Every seeded row must render, or a screen will show a blank where an authority
  // should be — and a blank authority reads as an unsourced decision.
  it("renders every clause in the seeded matrix", () => {
    const rules = rawRules as { clause: string; gap?: boolean }[];
    const unrenderable = rules.filter((r) => !r.gap && formatClause(r.clause) === null);
    expect(unrenderable.map((r) => r.clause)).toEqual([]);
  });

  it("never leaks an underscore or a raw slug into a rendered citation", () => {
    const rules = rawRules as { clause: string }[];
    for (const rule of rules) {
      const rendered = formatClause(rule.clause);
      if (rendered) expect(rendered).not.toMatch(/_/);
    }
  });
});
