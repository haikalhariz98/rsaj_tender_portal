import { describe, expect, it } from "vitest";

import { parseSen } from "@/lib/money";

import { applyOverrides, routingRatioOf, type OverrideRow } from "./override";
import { freezeRoutingType, routingSheet, type TypeNow } from "./routing-sheet";
import { snapshotFaults, type ComputedSnapshot } from "./snapshot";

/**
 * Carry 614-C5 (6.13 Part A step 3, against accepted 6.14): a banded routing target is judged on the figures as
 * they were sent for routing, overrides included, never on the ratio the module handed in when it opened the
 * certificate. The snapshot's ratio names the lines it is made of; the core works it out from them.
 */

const snap = (variation: string, overridable = true): ComputedSnapshot => ({
  version: 1,
  computedOn: "2026-10-03",
  rule: { en: "Variation (fixture)", ms: "Perubahan (lekapan)" },
  lines: [
    { key: "contractSum", labelEn: "Contract sum", labelMs: "Harga kontrak", type: "MONEY", value: "100000.00", overridable: false },
    { key: "variation", labelEn: "This variation", labelMs: "Perubahan ini", type: "MONEY", value: variation, overridable },
    { key: "omission", labelEn: "Omitted", labelMs: "Ditinggalkan", type: "MONEY", value: "0.00", overridable: true },
  ],
  totals: [{ key: "net", labelEn: "Net variation", labelMs: "Perubahan bersih", terms: [{ key: "variation", sign: 1 }, { key: "omission", sign: -1 }] }],
  routingRatio: { num: variation, den: "100000.00", labelEn: "The variation against the contract sum", labelMs: "Perubahan berbanding harga kontrak", numKey: "variation", denKey: "contractSum" },
});
const override = (fieldKey: string, overridden: string, at = "2026-10-03T02:00:00Z"): OverrideRow => ({ fieldKey, computed: "", overridden, justification: "Measured again on site", personName: "Officer", recordedAt: new Date(at) });

/// Two weeks up to and including 20%, six weeks above it (rulings 6.14 condition: "20.00% → 2 weeks, 20.01% → 6 weeks").
const TYPE: TypeNow = {
  id: "t",
  code: "t",
  labelEn: "Variation sheet (fixture)",
  labelMs: null,
  subject: "CERTIFICATE",
  certificateKind: null,
  upperEdgeInclusive: true,
  provenance: "ASSUMED",
  retiredOn: null,
  checks: [],
  targets: [
    { pctMin: null, pctMax: "20", targetDays: 14, provenance: "ASSUMED" },
    { pctMin: "20", pctMax: null, targetDays: 42, provenance: "ASSUMED" },
  ],
};
const targetOf = (s: ComputedSnapshot, rows: OverrideRow[]) => routingSheet({ type: freezeRoutingType(TYPE, "2026-10-03"), receivedOn: null, routes: [], checks: [], ratio: routingRatioOf(s, applyOverrides(s, rows)), today: "2026-10-03" }).target;

describe("614-C5: the routing ratio from the figures as they stand", () => {
  it("as computed: exactly 20.00% is in the two-week band", () => {
    expect(routingRatioOf(snap("20000.00"), applyOverrides(snap("20000.00"), []))).toEqual({ num: parseSen("20000.00"), den: parseSen("100000.00") });
    expect(targetOf(snap("20000.00"), [])).toMatchObject({ state: "SET", days: 14 });
  });

  it("a draft override moving the figure a sen across the edge changes the target (the edge test)", () => {
    expect(targetOf(snap("20000.00"), [override("variation", "20000.01")])).toMatchObject({ state: "SET", days: 42 });
    // And back again: the latest override applies.
    expect(targetOf(snap("20000.00"), [override("variation", "20000.01"), override("variation", "19999.99", "2026-10-03T03:00:00Z")])).toMatchObject({ state: "SET", days: 14 });
  });

  it("the handed-in strings no longer decide it: a module's stale ratio is not read where the lines are named", () => {
    const stale = { ...snap("30000.00"), routingRatio: { ...snap("30000.00").routingRatio!, num: "30000.00" } };
    expect(targetOf(stale, [override("variation", "10000.00")])).toMatchObject({ state: "SET", days: 14 });
  });

  it("a ratio may name a total: the net of its lines, overrides included", () => {
    const s: ComputedSnapshot = { ...snap("25000.00"), routingRatio: { ...snap("25000.00").routingRatio!, num: "25000.00", numKey: "net" } };
    expect(snapshotFaults(s)).toEqual([]);
    expect(targetOf(s, [])).toMatchObject({ days: 42 });
    expect(targetOf(s, [override("omission", "5000.00")])).toMatchObject({ days: 14 });
  });

  it("a ratio with no keys is read as handed in (6.14's form, unchanged)", () => {
    const s: ComputedSnapshot = { ...snap("20000.00"), routingRatio: { num: "20000.01", den: "100000.00", labelEn: "r", labelMs: "r" } };
    expect(targetOf(s, [override("variation", "1.00")])).toMatchObject({ days: 42 });
  });

  it("a denominator that is not above zero as the figures stand: no ratio, so no band (never a guess)", () => {
    const s: ComputedSnapshot = { ...snap("20000.00"), routingRatio: { ...snap("20000.00").routingRatio!, denKey: "omission", den: "0.00" } };
    expect(routingRatioOf(s, applyOverrides(s, []))).toBeNull();
    expect(targetOf(s, [])).toEqual({ state: "NO_RATIO" });
  });

  it("the snapshot is refused where a key names nothing, a figure that is not money, or a value other than the one computed", () => {
    const base = snap("20000.00");
    const bad = (r: Partial<NonNullable<ComputedSnapshot["routingRatio"]>>) => snapshotFaults({ ...base, routingRatio: { ...base.routingRatio!, ...r } }).map((f) => f.code);
    expect(bad({})).toEqual([]);
    expect(bad({ numKey: "nothing" })).toEqual(["RATIO"]);
    expect(bad({ num: "20000.01" })).toEqual(["RATIO"]);
    const pct: ComputedSnapshot = { ...base, lines: [...base.lines, { key: "pct", labelEn: "p", labelMs: "p", type: "PERCENT", value: "20.0000", overridable: false }], routingRatio: { ...base.routingRatio!, numKey: "pct" } };
    expect(snapshotFaults(pct).map((f) => f.code)).toEqual(["RATIO"]);
  });
});
