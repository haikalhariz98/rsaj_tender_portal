import { describe, expect, it } from "vitest";

import { bpToPercent, percentToBp, sameShares, splitFaults, splitSen } from "./split";
import type { SourceRef } from "./types";

const src = (id: string, sortOrder: number, extra: Partial<SourceRef> = {}): SourceRef => ({ id, code: id.toUpperCase(), label: id, sortOrder, envelope: null, categoriesRestricted: false, eligibleCategoryCodes: [], retiredOn: null, ...extra });
const A = src("a", 1);
const B = src("b", 2);
const C = src("c", 3);
const ON = new Date("2026-10-28T00:00:00Z");

describe("percentToBp", () => {
  it("reads up to two decimals", () => {
    expect([percentToBp("33.33"), percentToBp("60"), percentToBp("60.5"), percentToBp("100"), percentToBp("0.01")]).toEqual([3333, 6000, 6050, 10000, 1]);
  });
  it("refuses more decimals, zero, over 100 and words", () => {
    expect([percentToBp("33.333"), percentToBp("0"), percentToBp("100.01"), percentToBp("abc"), percentToBp("-5"), percentToBp("")]).toEqual([null, null, null, null, null, null]);
  });
  it("prints back without trailing zeros", () => {
    expect([bpToPercent(6000), bpToPercent(3333), bpToPercent(6050), bpToPercent(10000)]).toEqual(["60", "33.33", "60.5", "100"]);
  });
});

describe("splitSen (FS-9)", () => {
  const sum = (m: Map<string, bigint>) => [...m.values()].reduce((a, b) => a + b, 0n);
  it("100.01 at 50/50 gives 50.01 and 50.00 by order", () => {
    const m = splitSen(10001n, [{ sourceId: "b", bp: 5000 }, { sourceId: "a", bp: 5000 }], [A, B]);
    expect(m.get("a")).toBe(5001n);
    expect(m.get("b")).toBe(5000n);
  });
  it("33.33/33.33/33.34 sums exactly", () => {
    const m = splitSen(100n, [{ sourceId: "a", bp: 3333 }, { sourceId: "b", bp: 3333 }, { sourceId: "c", bp: 3334 }], [A, B, C]);
    expect(sum(m)).toBe(100n);
    expect([m.get("a"), m.get("b"), m.get("c")]).toEqual([33n, 33n, 34n]);
  });
  it("a single 100% takes the whole", () => {
    expect(splitSen(123456n, [{ sourceId: "a", bp: 10000 }], [A]).get("a")).toBe(123456n);
  });
  it("a negative amount is split by its magnitude and negated", () => {
    const m = splitSen(-10001n, [{ sourceId: "a", bp: 5000 }, { sourceId: "b", bp: 5000 }], [A, B]);
    expect([m.get("a"), m.get("b")]).toEqual([-5001n, -5000n]);
  });
  it("ties go by sortOrder, then code", () => {
    const x = src("x", 1);
    const y = src("y", 1);
    const m = splitSen(1n, [{ sourceId: "y", bp: 5000 }, { sourceId: "x", bp: 5000 }], [y, x]);
    expect([m.get("x"), m.get("y")]).toEqual([1n, 0n]);
  });
  it("the parts always sum to the whole, over 200 seeded amounts", () => {
    let seed = 20261028;
    const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648);
    for (let n = 0; n < 200; n++) {
      const amount = BigInt(next()) * BigInt(next() % 1000) - 5_000_000n;
      const first = 1 + (next() % 9998);
      const second = 1 + (next() % (9999 - first));
      const shares = [{ sourceId: "a", bp: first }, { sourceId: "b", bp: second }, { sourceId: "c", bp: 10000 - first - second }];
      const m = splitSen(amount, shares, [A, B, C]);
      expect(sum(m)).toBe(amount);
      expect(splitSen(amount, shares, [A, B, C])).toEqual(m);
    }
  });
  it("refuses shares that do not sum to 100%", () => {
    expect(() => splitSen(100n, [{ sourceId: "a", bp: 5000 }], [A])).toThrow();
  });
});

describe("splitFaults (FS-7)", () => {
  const base = { sources: [A, B, C], categoryCode: null, locked: false, on: ON };
  const rows = (...r: [string, string][]) => r.map(([sourceId, pct]) => ({ sourceId, pct }));
  it("a good split has no fault", () => {
    expect(splitFaults({ ...base, rows: rows(["a", "60"], ["b", "40"]) })).toEqual([]);
  });
  it("the sum is not 100", () => {
    expect(splitFaults({ ...base, rows: rows(["a", "60"], ["b", "30"]) })).toEqual(["NOT_100"]);
  });
  it("empty, too many, a bad percent, a repeated source", () => {
    expect(splitFaults({ ...base, rows: [] })).toEqual(["EMPTY"]);
    const six = [A, B, C, src("d", 4), src("e", 5), src("f", 6)];
    expect(splitFaults({ ...base, sources: six, rows: six.map((s, n) => ({ sourceId: s.id, pct: n < 5 ? "16.66" : "16.7" })) })).toContain("TOO_MANY");
    expect(splitFaults({ ...base, rows: rows(["a", "60.123"], ["b", "40"]) })).toEqual(["BAD_PERCENT"]);
    expect(splitFaults({ ...base, rows: rows(["a", "50"], ["a", "50"]) })).toEqual(["DUPLICATE_SOURCE"]);
  });
  it("a retired or unknown source is not in force", () => {
    const retired = src("r", 9, { retiredOn: ON });
    expect(splitFaults({ ...base, sources: [A, retired], rows: rows(["a", "50"], ["r", "50"]) })).toEqual(["NOT_IN_FORCE"]);
    expect(splitFaults({ ...base, rows: rows(["a", "50"], ["zz", "50"]) })).toEqual(["NOT_IN_FORCE"]);
  });
  it("an ineligible source, and a restricted source with no category", () => {
    const sukuk = src("s", 1, { categoriesRestricted: true, eligibleCategoryCodes: ["WATER"] });
    expect(splitFaults({ ...base, sources: [sukuk, A], categoryCode: "OFFICE", rows: rows(["s", "60"], ["a", "40"]) })).toEqual(["NOT_ELIGIBLE"]);
    expect(splitFaults({ ...base, sources: [sukuk, A], categoryCode: null, rows: rows(["s", "60"], ["a", "40"]) })).toEqual(["CATEGORY_MISSING"]);
    expect(splitFaults({ ...base, sources: [sukuk, A], categoryCode: "WATER", rows: rows(["s", "60"], ["a", "40"]) })).toEqual([]);
  });
  it("locked refuses whatever the rows", () => {
    expect(splitFaults({ ...base, locked: true, rows: rows(["a", "100"]) })).toEqual(["LOCKED"]);
  });
});

describe("sameShares", () => {
  it("is the same sources at the same shares, in any order", () => {
    const a = [{ sourceId: "s", bp: 6000 }, { sourceId: "i", bp: 4000 }];
    expect(sameShares(a, [{ sourceId: "i", bp: 4000 }, { sourceId: "s", bp: 6000 }])).toBe(true);
    expect(sameShares(a, [{ sourceId: "s", bp: 5000 }, { sourceId: "i", bp: 5000 }])).toBe(false);
    expect(sameShares(a, [{ sourceId: "s", bp: 10000 }])).toBe(false);
  });
});
