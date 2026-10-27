import { describe, expect, it } from "vitest";

import { parseSen, senToDecimalString } from "@/lib/money";

import { releaseOf, retentionFaults, retentionHeld, retentionReading, ZERO_TIERS, type ReleaseInput } from "./retention";

/**
 * Retention (FR-PAY-011, 021; §8.5; B3 as ruled). FIXTURE ONLY: 10% capped at 5% and the 50% first release are
 * the specification's quotation-route and OM/P/007 figures, never seeded.
 */

const s = parseSen;
const money = (v: bigint | null) => (v == null ? null : senToDecimalString(v));
const codes = (fs: readonly { code: string }[]) => fs.map((f) => f.code);

describe("whether retention applies (B3: from the baseline; never 0)", () => {
  it("no retention in the band (§8.5): no retention lines, the certificate is allowed", () => {
    const r = retentionReading({ applies: false, percent: null, capPercent: null, source: "DERIVED" });
    expect(r).toEqual({ state: "NONE", source: "DERIVED" });
    expect(retentionFaults(r)).toEqual([]);
    expect(retentionHeld(r, s("1000000.00"), { MAIN: s("100000.00"), NSC: 0n, NS: 0n }).net).toEqual(ZERO_TIERS);
  });
  it("does not apply by a recorded decision at baseline (ENTERED, with its provenance): allowed", () => {
    expect(retentionFaults(retentionReading({ applies: false, percent: null, capPercent: null, source: "ENTERED" }))).toEqual([]);
  });
  it("does not apply from any other source: refused (only a configured band or a recorded decision says so)", () => {
    expect(codes(retentionFaults(retentionReading({ applies: false, percent: null, capPercent: null, source: "AWARD" })))).toEqual(["RETENTION_NONE_UNSUPPORTED"]);
  });
  it("applies with no percentage, or no cap, or unset: refused naming the field", () => {
    expect(retentionFaults(retentionReading({ applies: true, percent: null, capPercent: "5", source: "DERIVED" }))).toEqual([{ code: "RETENTION_NOT_SET", level: "block", data: { field: "retentionPercent" } }]);
    expect(retentionFaults(retentionReading({ applies: true, percent: "10", capPercent: null, source: "AWARD" }))[0].data).toEqual({ field: "retentionCapPercent" });
    expect(retentionFaults(retentionReading({ applies: null, percent: "10", capPercent: "5", source: null }))[0].data).toEqual({ field: "retentionApplies" });
  });
});

describe("held to date, under the cap", () => {
  const terms = retentionReading({ applies: true, percent: "10", capPercent: "5", source: "AWARD" });
  it("each tier its percentage, half up to the sen", () => {
    const h = retentionHeld(terms, s("1077508.60"), { MAIN: s("12345.65"), NSC: s("0.05"), NS: 0n });
    expect([h.held.MAIN, h.held.NSC, h.held.NS].map(money)).toEqual(["1234.57", "0.01", "0.00"]);
  });
  it("exactly at the cap is not over it; a sen over is capped", () => {
    // 5% × 1,000,000.00 = 50,000.00; 10% × 500,000.00 = 50,000.00.
    expect(retentionHeld(terms, s("1000000.00"), { MAIN: s("500000.00"), NSC: 0n, NS: 0n }).capped).toBe(false);
    const over = retentionHeld(terms, s("1000000.00"), { MAIN: s("500000.10"), NSC: 0n, NS: 0n });
    expect(over.capped).toBe(true);
    expect(money(over.held.MAIN)).toBe("50000.00");
  });
  it("the cap shared pro rata, the leftover sen by the waterfall's rule (BD-613-28 as amended), summing to the cap", () => {
    const h = retentionHeld(terms, s("100000.00"), { MAIN: s("60000.00"), NSC: s("30000.00"), NS: s("10000.00") });
    // computed 6,000 / 3,000 / 1,000 = 10,000 > cap 5,000 → 3,000 / 1,500 / 500.
    expect([h.held.MAIN, h.held.NSC, h.held.NS].map(money)).toEqual(["3000.00", "1500.00", "500.00"]);
    const odd = retentionHeld(terms, s("100000.00"), { MAIN: s("33333.33"), NSC: s("33333.33"), NS: s("33333.34") }, ZERO_TIERS, "LARGEST_REMAINDER");
    expect(odd.held.MAIN + odd.held.NSC + odd.held.NS).toBe(s("5000.00"));
  });
});

describe("release (FR-PAY-021)", () => {
  const base: ReleaseInput = { kind: "RELEASED_FIRST", held: { MAIN: s("53875.43"), NSC: 0n, NS: 0n }, already: { first: false, balance: false }, firstReleasePct: "50", asBuiltHandedOver: true, balanceEvent: { state: "NOT_REACHED", event: "MAKING_GOOD", missing: "MAKING_GOOD" }, firstReleased: ZERO_TIERS };
  it("first release 50% of 53,875.43 = 26,937.72; the balance 26,937.71; together what is held", () => {
    const first = releaseOf(base);
    expect(first.faults).toEqual([]);
    expect(money(first.amounts!.MAIN)).toBe("26937.72");
    const balance = releaseOf({ ...base, kind: "RELEASED_BALANCE", already: { first: true, balance: false }, balanceEvent: { state: "REACHED", event: "MAKING_GOOD" }, firstReleased: first.amounts! });
    expect(money(balance.amounts!.MAIN)).toBe("26937.71");
    expect(first.amounts!.MAIN + balance.amounts!.MAIN).toBe(s("53875.43"));
  });
  it("the first release without the as-built drawings handed over is refused", () => {
    expect(codes(releaseOf({ ...base, asBuiltHandedOver: false }).faults)).toEqual(["AS_BUILT_NOT_HANDED_OVER"]);
  });
  it("the first release's percentage unset refuses (never a default)", () => {
    expect(codes(releaseOf({ ...base, firstReleasePct: null }).faults)).toEqual(["FIRST_RELEASE_PCT_NOT_SET"]);
  });
  it("the balance without the Certificate of Making Good Defects is refused (it arrives with Part B)", () => {
    expect(codes(releaseOf({ ...base, kind: "RELEASED_BALANCE", already: { first: true, balance: false } }).faults)).toEqual(["MAKING_GOOD_NOT_ISSUED"]);
  });
  // Phase 2 close-out stage B (plan §6.3, flagged: makingGoodIssued became balanceEvent, each assertion kept): the balance's event read from its switch.
  it("the balance's event unset, its final inspection not recorded, or the event the final payment is refused, each by name", () => {
    const balance = { ...base, kind: "RELEASED_BALANCE" as const, already: { first: true, balance: false } };
    expect(codes(releaseOf({ ...balance, balanceEvent: { state: "NOT_SET" } }).faults)).toEqual(["RELEASE_EVENT_NOT_SET"]);
    expect(codes(releaseOf({ ...balance, balanceEvent: { state: "NOT_REACHED", event: "MAKING_GOOD", missing: "FINAL_INSPECTION" } }).faults)).toEqual(["FINAL_INSPECTION_NOT_RECORDED"]);
    expect(codes(releaseOf({ ...balance, balanceEvent: { state: "REACHED", event: "FINAL_PAYMENT" } }).faults)).toEqual(["BALANCE_WITH_FINAL_PAYMENT"]);
    expect(codes(releaseOf({ ...balance, balanceEvent: { state: "NOT_REACHED", event: "FINAL_PAYMENT", missing: "FINAL_PAYMENT" } }).faults)).toEqual(["BALANCE_WITH_FINAL_PAYMENT"]);
    expect(releaseOf({ ...balance, balanceEvent: { state: "REACHED", event: "MAKING_GOOD" } }).faults).toEqual([]);
  });
  it("no release twice, and nothing to release when nothing is held", () => {
    expect(codes(releaseOf({ ...base, already: { first: true, balance: false } }).faults)).toEqual(["ALREADY_RELEASED"]);
    expect(codes(releaseOf({ ...base, kind: "RELEASED_BALANCE", already: { first: true, balance: true }, balanceEvent: { state: "REACHED", event: "MAKING_GOOD" } }).faults)).toEqual(["ALREADY_RELEASED"]);
    expect(codes(releaseOf({ ...base, held: null }).faults)).toEqual(["NOTHING_HELD"]);
  });
  // Code review of close-out stage B, F1: the balance took all that was held, so a first release recorded after it would pay retention twice.
  it("a first release after the balance is refused", () => {
    const r = releaseOf({ ...base, already: { first: false, balance: true } });
    expect(codes(r.faults)).toEqual(["ALREADY_RELEASED"]);
    expect(r.amounts).toBeNull();
  });
});
