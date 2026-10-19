import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type { ExactRatio } from "@/lib/percent-band";

import { inBand, pctBandMatch, regimeFor } from "./resolve";
import type { Policy } from "./types";

/**
 * Review 3 and the BD-613-5 ruling (ADR 0024 Amendment 1), as corrected by the 6.13 Part A residual review (D1):
 * the help says what the resolver does (resolve.ts inBand and pctBandMatch). An amount edge is flipped only
 * exactly at the tender floor (policy.boundaryValue), for the regime bands and for a rule with
 * followsBoundarySwitch === true; every other amount edge is (min, max]. Every percentage edge follows the switch.
 * Never "nothing else", and never "every amount edge". The percentage-edge line carries the boundary provenance tag.
 */
const ROOT = path.join(__dirname, "../../..");
const read = (f: string) => readFileSync(path.join(ROOT, f), "utf8");

describe("the boundary switch's words", () => {
  it("the editor's help says the switch flips an amount edge only on the tender floor for a following rule, and every percentage edge", () => {
    const e = read("src/app/configuration/approval-matrix/editors.tsx");
    expect(e).toMatch(
      /Amounts: it decides only a value exactly on the tender floor, for the quotation and tender bands and for a rule whose edge sits on the tender floor and that is set to follow the switch; every other amount edge counts in the band it closes\. Percentages: it decides every band edge on this matrix\. On, a value exactly on an edge it decides falls in the band the edge closes; off, in the band it opens\./,
    );
    expect(e).not.toMatch(/nothing else/);
    expect(e).not.toMatch(/every amount and percentage band edge/);
  });
  // Changed to match 0005 R14, 2026-10-20: the provenance badge shows once, on "Boundary ruling"; the percentage line says it takes the boundary's side.
  it("the percentage-edge line follows the boundary ruling, whose provenance tag shows once", () => {
    const p = read("src/app/configuration/approval-matrix/page.tsx");
    const at = p.indexOf('label: "A percentage exactly on a band edge"');
    expect(at).toBeGreaterThan(-1);
    const item = p.slice(at, p.indexOf('label: "Boundary ruling"'));
    expect(item).toMatch(/Same side as the boundary/);
    expect(item).not.toMatch(/ProvenanceBadge/);
    expect(p.match(/<ProvenanceBadge value=\{boundaryMeta\.boundaryProvenance\} \/>/g)).toHaveLength(1);
  });
});

describe("the words match the resolver (D1)", () => {
  const policy = (boundaryInclusive: boolean): Policy => ({ boundaryValue: 300_000, boundaryInclusive, quotationFloor: 20_000, tenderFloor: 300_000, requisitionBoundary: 20_000, currency: "MYR" });
  const ratio = (num: bigint, den: bigint): ExactRatio => ({ num, den });

  it("an amount exactly on the tender floor: a following rule's edge flips with the switch", () => {
    expect(inBand(300_000, 20_000, 300_000, policy(true), true)).toBe(true);
    expect(inBand(300_000, 20_000, 300_000, policy(false), true)).toBe(false);
    expect(inBand(300_000, 300_000, null, policy(false), true)).toBe(true);
    expect(regimeFor(300_000, policy(true))).toBe("quotation");
    expect(regimeFor(300_000, policy(false))).toBe("tender");
  });
  it("an amount exactly on the tender floor: a rule not following the switch (or undecided) stays (min, max]", () => {
    for (const follows of [false, null]) {
      expect(inBand(300_000, 20_000, 300_000, policy(false), follows)).toBe(true);
      expect(inBand(300_000, 300_000, null, policy(false), follows)).toBe(false);
    }
  });
  it("any other amount edge counts in the band it closes, whichever way the switch is set", () => {
    for (const inclusive of [true, false]) {
      expect(inBand(1_000_000, 300_000, 1_000_000, policy(inclusive), true)).toBe(true);
      expect(inBand(1_000_000, 1_000_000, null, policy(inclusive), true)).toBe(false);
    }
  });
  it("every percentage edge follows the switch", () => {
    // 10% exactly, an edge nowhere near the amount boundary.
    expect(pctBandMatch(ratio(10n, 100n), "5", "10", true)).toBe("IN");
    expect(pctBandMatch(ratio(10n, 100n), "5", "10", false)).toBe("OUT");
    expect(pctBandMatch(ratio(10n, 100n), "10", null, false)).toBe("IN");
    expect(pctBandMatch(ratio(10n, 100n), "10", null, true)).toBe("OUT");
  });
});
