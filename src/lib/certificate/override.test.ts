import { describe, expect, it } from "vitest";

import { INTERIM_FIGURES } from "./fixture";
import { applyOverrides, normaliseValue, overrideFaults, type OverrideInput, type OverrideRow } from "./override";
import { snapshotFaults, totalsFrom, valueFault, type ComputedSnapshot } from "./snapshot";

/**
 * FR-CRT-003 and the rulings' condition: a computed figure is overridden only in DRAFT, with a justification
 * and a named Person; totals are recomputed from the lines and never overridden; both figures are kept.
 *
 * Worked example (invented figures a finance officer can check by hand):
 *   Gross valuation                120,000.00
 *   Less retention                  −6,000.00
 *   Net valuation (total)          114,000.00
 *   Less previously certified      −50,000.00
 *   Amount due (total)              64,000.00
 * The gross valuation is overridden to 118,500.00 (a line measured twice): the net valuation becomes
 * 112,500.00 and the amount due 62,500.00; the computed figures stay beside them.
 */

const at = (iso: string) => new Date(`${iso}T02:00:00Z`);
const o = (fieldKey: string, overridden: string, when = "2026-09-29", computed = "120000.00"): OverrideRow => ({ fieldKey, computed, overridden, justification: "Measured twice in the valuation", personName: "Officer A", recordedAt: at(when) });
const input = (over: Partial<OverrideInput> = {}): OverrideInput => {
  const current = applyOverrides(INTERIM_FIGURES, []);
  return { status: "DRAFT", snapshot: INTERIM_FIGURES, current, fieldKey: "grossValuation", value: "118,500.00", justification: "Measured twice", personKnown: true, ...over };
};
const codes = (r: { faults: { code: string }[] }) => r.faults.map((f) => f.code);

describe("the worked example", () => {
  it("as computed, the totals balance", () => {
    const e = applyOverrides(INTERIM_FIGURES, []);
    expect(e.totals.map((t) => [t.key, t.value])).toEqual([
      ["netValuation", "114000.00"],
      ["amountDue", "64000.00"],
    ]);
    expect(e.overridden).toBe(false);
  });
  it("an override of a line moves every total built on it, and both figures are kept", () => {
    const e = applyOverrides(INTERIM_FIGURES, [o("grossValuation", "118500.00")]);
    const gross = e.lines.find((l) => l.key === "grossValuation")!;
    expect(gross.value).toBe("118500.00");
    expect(gross.computed).toBe("120000.00");
    expect(gross.override?.justification).toBe("Measured twice in the valuation");
    expect(e.totals.map((t) => [t.key, t.value, t.computed])).toEqual([
      ["netValuation", "112500.00", "114000.00"],
      ["amountDue", "62500.00", "64000.00"],
    ]);
    expect(e.overridden).toBe(true);
  });
  it("the latest override of a field applies; one back to the computed figure withdraws it", () => {
    const e = applyOverrides(INTERIM_FIGURES, [o("grossValuation", "118500.00", "2026-09-29"), o("grossValuation", "119000.00", "2026-09-30")]);
    expect(e.lines[0].value).toBe("119000.00");
    const back = applyOverrides(INTERIM_FIGURES, [o("grossValuation", "118500.00", "2026-09-29"), o("grossValuation", "120000.00", "2026-09-30")]);
    expect(back.lines[0].override).toBeNull();
    expect(back.overridden).toBe(false);
  });
  it("an override stored against a line the module does not allow is never applied", () => {
    const e = applyOverrides(INTERIM_FIGURES, [o("previouslyCertified", "1.00", "2026-09-29", "50000.00")]);
    expect(e.lines.find((l) => l.key === "previouslyCertified")!.value).toBe("50000.00");
  });
});

describe("overrideFaults", () => {
  it("accepted in DRAFT with a justification and a named Person, normalised to the snapshot's form", () => {
    const r = overrideFaults(input());
    expect(codes(r)).toEqual([]);
    expect(r.normalised).toBe("118500.00");
    expect(r.computed).toBe("120000.00");
  });
  it("refused from IN_ROUTING on (rulings condition), and in every later state", () => {
    for (const status of ["IN_ROUTING", "SIGNING", "ISSUED", "VOID"] as const) expect(codes(overrideFaults(input({ status })))).toEqual(["OVERRIDE_NOT_IN_DRAFT"]);
  });
  it("a total is never overridable", () => {
    expect(codes(overrideFaults(input({ fieldKey: "amountDue" })))).toEqual(["TOTAL_NOT_OVERRIDABLE"]);
    expect(codes(overrideFaults(input({ fieldKey: "netValuation" })))).toEqual(["TOTAL_NOT_OVERRIDABLE"]);
  });
  it("no justification, or no Person, is refused", () => {
    expect(codes(overrideFaults(input({ justification: "  " })))).toEqual(["JUSTIFICATION_REQUIRED"]);
    expect(codes(overrideFaults(input({ personKnown: false })))).toEqual(["PERSON_REQUIRED"]);
  });
  it("a line the module does not allow, a figure not on it, a value not of its type, or the figure as it stands", () => {
    expect(codes(overrideFaults(input({ fieldKey: "previouslyCertified", value: "1.00" })))).toEqual(["NOT_OVERRIDABLE"]);
    expect(codes(overrideFaults(input({ fieldKey: "nothing" })))).toEqual(["UNKNOWN_FIELD"]);
    expect(codes(overrideFaults(input({ value: "12.345" })))).toEqual(["OVERRIDE_VALUE"]);
    expect(codes(overrideFaults(input({ value: "120000" })))).toEqual(["SAME_AS_NOW"]);
  });
  it("no figures at all", () => {
    expect(codes(overrideFaults(input({ snapshot: null, current: null })))).toEqual(["NO_FIGURES"]);
  });
});

describe("snapshots hold money as decimal strings (rulings condition)", () => {
  it("the fixture is sound", () => {
    expect(snapshotFaults(INTERIM_FIGURES)).toEqual([]);
  });
  it("a float, a separator or a third decimal is refused", () => {
    expect(valueFault("MONEY", "120000.5")).toBe(true);
    expect(valueFault("MONEY", "120,000.00")).toBe(true);
    expect(valueFault("MONEY", "1.005")).toBe(true);
    expect(valueFault("MONEY", "1e5")).toBe(true);
    expect(valueFault("MONEY", "120000.50")).toBe(false);
    expect(valueFault("PERCENT", "5.00001")).toBe(true);
    expect(valueFault("DAYS", "2.5")).toBe(true);
    expect(valueFault("DATE", "2026-02-30")).toBe(true);
  });
  it("a total naming something not a money line or an earlier total, a key used twice, a bad ratio", () => {
    const bad: ComputedSnapshot = {
      ...INTERIM_FIGURES,
      lines: [...INTERIM_FIGURES.lines, { ...INTERIM_FIGURES.lines[0] }],
      totals: [{ key: "t", labelEn: "T", labelMs: "T", terms: [{ key: "retentionPct", sign: 1 }, { key: "later", sign: 1 }] }, { key: "later", labelEn: "L", labelMs: "L", terms: [] }],
      routingRatio: { num: "1.00", den: "0.00", labelEn: "r", labelMs: "r" },
    };
    expect(snapshotFaults(bad).map((f) => f.code).sort()).toEqual(["FIELD_REPEATED", "RATIO", "TOTAL_EMPTY", "TOTAL_TERM", "TOTAL_TERM"].sort());
  });
  it("a total with a line not computed is itself not computed, never a sum that counted the gap as nothing", () => {
    const t = totalsFrom(INTERIM_FIGURES, new Map([["grossValuation", "120000.00"], ["retention", null], ["previouslyCertified", "50000.00"]]));
    expect(t.get("netValuation")).toBeNull();
    expect(t.get("amountDue")).toBeNull();
  });
  it("normaliseValue", () => {
    expect(normaliseValue("MONEY", " 1,234.5 ")).toBe("1234.50");
    expect(normaliseValue("MONEY", "abc")).toBeNull();
    expect(normaliseValue("TEXT", "  ")).toBeNull();
  });
});

describe("property: whatever is overridden, every total equals the signed sum of its terms, to the sen", () => {
  it("holds over a sweep of amounts", () => {
    for (let i = 0; i < 200; i++) {
      const gross = BigInt(i * 7919 + 13) * 101n;
      const ret = BigInt(i * 31 + 7);
      const g = `${gross / 100n}.${(gross % 100n).toString().padStart(2, "0")}`;
      const r = `${ret / 100n}.${(ret % 100n).toString().padStart(2, "0")}`;
      const e = applyOverrides(INTERIM_FIGURES, [o("grossValuation", g), { ...o("retention", r), computed: "6000.00" }]);
      const net = BigInt(e.totals[0].value!.replace(".", ""));
      expect(net).toBe(gross - ret);
      expect(BigInt(e.totals[1].value!.replace(".", "").replace("-", "")) * (e.totals[1].value!.startsWith("-") ? -1n : 1n)).toBe(gross - ret - 5_000_000n);
    }
  });
});
