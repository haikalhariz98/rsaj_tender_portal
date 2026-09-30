import { describe, expect, it } from "vitest";

import { parseSen } from "@/lib/money";

import { contractTypeChoice, defaultContractType, parsePct, scopeFaults } from "./contract-type";
import { SPEC_TYPES } from "./fixture";
import type { DeliverableKind } from "./types";

const on = new Date("2026-09-30T00:00:00Z");
const part = (kind: DeliverableKind, v: string) => ({ kind, amount: parseSen(v) });
const FIFTY = { dominanceSharePct: "50.0000", provenance: "ASSUMED" as const };
const UNSET = { dominanceSharePct: null, provenance: null };

describe("the default contract type from the deliverable test (FR-MTD-011)", () => {
  it("goods → Supply, measured construction → Work, term performance → Service", () => {
    expect(defaultContractType([part("GOODS_DELIVERED", "1000.00")], SPEC_TYPES, UNSET, on).code).toBe("SUPPLY");
    expect(defaultContractType([part("MEASURED_CONSTRUCTION", "1000.00")], SPEC_TYPES, UNSET, on).code).toBe("WORK");
    expect(defaultContractType([part("TERM_PERFORMANCE", "1000.00")], SPEC_TYPES, UNSET, on).code).toBe("SERVICE");
  });
  it("mixed 70/30 at a 50% threshold → Work", () => {
    const d = defaultContractType([part("MEASURED_CONSTRUCTION", "105000.00"), part("GOODS_DELIVERED", "45000.00")], SPEC_TYPES, FIFTY, on);
    expect(d).toEqual({ state: "DERIVED", code: "WORK", kind: "MEASURED_CONSTRUCTION", sharePct: "70.0000" });
  });
  it("50/50 is not dominant: the share must be strictly above the threshold", () => {
    const d = defaultContractType([part("MEASURED_CONSTRUCTION", "50000.00"), part("GOODS_DELIVERED", "50000.00")], SPEC_TYPES, FIFTY, on);
    expect(d.state).toBe("MIXED_NO_DOMINANT");
  });
  it("a sen above half is dominant, computed exactly", () => {
    const d = defaultContractType([part("MEASURED_CONSTRUCTION", "50000.01"), part("GOODS_DELIVERED", "50000.00")], SPEC_TYPES, FIFTY, on);
    expect(d.code).toBe("WORK");
  });
  it("with no threshold set, mixed scope has no default (ruling R-11)", () => {
    const d = defaultContractType([part("MEASURED_CONSTRUCTION", "105000.00"), part("GOODS_DELIVERED", "45000.00")], SPEC_TYPES, UNSET, on);
    expect(d.state).toBe("THRESHOLD_NOT_SET");
    expect(d.code).toBeNull();
  });
  it("one deliverable needs no threshold", () => {
    expect(defaultContractType([part("GOODS_DELIVERED", "1.00"), part("GOODS_DELIVERED", "2.00")], SPEC_TYPES, UNSET, on).code).toBe("SUPPLY");
  });
  it("no type for the deliverable, or two, derive nothing; no scope derives nothing", () => {
    expect(defaultContractType([part("GOODS_DELIVERED", "1.00")], SPEC_TYPES.filter((t) => t.code !== "SUPPLY"), UNSET, on).state).toBe("NO_TYPE_FOR_KIND");
    expect(defaultContractType([part("GOODS_DELIVERED", "1.00")], [...SPEC_TYPES, { ...SPEC_TYPES[2], code: "SUPPLY2" }], UNSET, on).state).toBe("SEVERAL_TYPES_FOR_KIND");
    expect(defaultContractType([], SPEC_TYPES, UNSET, on).state).toBe("NO_SCOPE");
  });
  it("parses the threshold exactly", () => {
    expect(parsePct("50")).toBe(500000n);
    expect(parsePct("62.5")).toBe(625000n);
  });
});

describe("the scope split", () => {
  it("must add up to the exercise's value", () => {
    expect(scopeFaults([{ amount: parseSen("100.00") }], parseSen("100.00"))).toEqual([]);
    expect(scopeFaults([{ amount: parseSen("99.99") }], parseSen("100.00"))[0].code).toBe("SCOPE_SUM_MISMATCH");
    expect(scopeFaults([], parseSen("100.00"))[0].code).toBe("SCOPE_REQUIRED");
  });
});

describe("choosing another type, and the lock", () => {
  const derived = defaultContractType([part("GOODS_DELIVERED", "1.00")], SPEC_TYPES, UNSET, on);
  const ctx = { lockedAt: null, currentCode: null, on };
  it("none chosen takes the derived type", () => {
    expect(contractTypeChoice(derived, { code: null, reason: "", personId: null }, SPEC_TYPES, ctx)).toEqual({ state: "DERIVED", code: "SUPPLY", faults: [] });
  });
  it("an override needs a reason and a named Person", () => {
    const c = contractTypeChoice(derived, { code: "SERVICE", reason: "", personId: null }, SPEC_TYPES, ctx);
    expect(c.faults.map((f) => f.code)).toEqual(["TYPE_REASON_REQUIRED", "TYPE_PERSON_REQUIRED"]);
    expect(contractTypeChoice(derived, { code: "SERVICE", reason: "Maintenance over a term", personId: "p" }, SPEC_TYPES, ctx).state).toBe("OVERRIDDEN");
  });
  it("with nothing derived a type must be chosen, and is CHOSEN", () => {
    const none = defaultContractType([part("MEASURED_CONSTRUCTION", "1.00"), part("GOODS_DELIVERED", "1.00")], SPEC_TYPES, UNSET, on);
    expect(contractTypeChoice(none, { code: null, reason: "", personId: null }, SPEC_TYPES, ctx).faults[0].code).toBe("TYPE_REQUIRED");
    expect(contractTypeChoice(none, { code: "WORK", reason: "Mostly works", personId: "p" }, SPEC_TYPES, ctx).state).toBe("CHOSEN");
  });
  it("after award the type is locked", () => {
    const c = contractTypeChoice(derived, { code: "WORK", reason: "x", personId: "p" }, SPEC_TYPES, { ...ctx, lockedAt: new Date(), currentCode: "SUPPLY" });
    expect(c.faults.map((f) => f.code)).toEqual(["LOCKED"]);
  });
});

describe("a tie for the largest deliverable (review #3)", () => {
  const THIRTY = { dominanceSharePct: "30.0000", provenance: "ASSUMED" as const };
  it("40/40/20 at a 30% threshold derives nothing, in either order", () => {
    const one = defaultContractType([part("MEASURED_CONSTRUCTION", "40.00"), part("GOODS_DELIVERED", "40.00"), part("TERM_PERFORMANCE", "20.00")], SPEC_TYPES, THIRTY, on);
    const other = defaultContractType([part("GOODS_DELIVERED", "40.00"), part("MEASURED_CONSTRUCTION", "40.00"), part("TERM_PERFORMANCE", "20.00")], SPEC_TYPES, THIRTY, on);
    expect(one.state).toBe("MIXED_NO_DOMINANT");
    expect(other.state).toBe("MIXED_NO_DOMINANT");
    expect(one.code).toBeNull();
    expect(one.kind).toBeNull();
    expect(other.kind).toBeNull();
  });
  it("names no largest deliverable on a tie with the threshold unset, in either order", () => {
    const unset = { dominanceSharePct: null, provenance: null };
    const a = defaultContractType([part("MEASURED_CONSTRUCTION", "40.00"), part("GOODS_DELIVERED", "40.00")], SPEC_TYPES, unset, on);
    const b = defaultContractType([part("GOODS_DELIVERED", "40.00"), part("MEASURED_CONSTRUCTION", "40.00")], SPEC_TYPES, unset, on);
    expect(a).toEqual(b);
    expect(a.state).toBe("THRESHOLD_NOT_SET");
    expect(a.kind).toBeNull();
    const untied = defaultContractType([part("MEASURED_CONSTRUCTION", "60.00"), part("GOODS_DELIVERED", "40.00")], SPEC_TYPES, unset, on);
    expect(untied.kind).toBe("MEASURED_CONSTRUCTION");
  });
});
