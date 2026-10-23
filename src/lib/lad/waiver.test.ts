import { describe, expect, it } from "vitest";

import { parseSen } from "@/lib/money";
import { ratioPercentText } from "@/lib/percent-band";

import { applicationOf, ladAmountAt, waiverRatio, waiverRecordFaults, type LadAmountInput } from "./waiver";

/**
 * 6.13 Part B run 1b (FR-LAD-008, 009; OD-B7 as ruled, BD-613-75): the waiver's LAD amount, its ratio, and when it
 * reaches the money. Pure. Worked example 12's figures in fixtures: 8,081.40, 2,020.35 (25%), 3,232.56 (40%).
 */

const R = parseSen("269.38");
const codes = (fs: readonly { code: string }[]) => fs.map((f) => f.code);
const base: LadAmountInput = { window: { from: "2026-09-01", until: null }, asOf: "2026-09-30", scopeDate: "2026-08-31", superseded: null, charged: [], segments: [{ from: null, until: null, rate: R }] };

describe("the LAD amount (the decision's damages charged and chargeable to the stated day, less credits)", () => {
  it("chargeable 1–30 Sep at 269.38 → 8,081.40", () => expect(ladAmountAt(base)).toBe(parseSen("8081.40")));
  it("days charged on an issued line count at the rate it charged them", () => {
    expect(ladAmountAt({ ...base, charged: [{ from: "2026-09-01", until: "2026-09-16", rate: parseSen("250.00") }] })).toBe(parseSen("250.00") * 15n + R * 15n);
  });
  it("net of the credit: an extension to 14 Sep leaves 16 days, 4,310.08", () => expect(ladAmountAt({ ...base, scopeDate: "2026-09-14" })).toBe(R * 16n));
  it("superseded: nothing after the new date is chargeable on it", () => expect(ladAmountAt({ ...base, scopeDate: "2026-09-14", superseded: { newDate: "2026-09-14" } })).toBe(0n));
  it("the window closed at completion: nothing after it", () => expect(ladAmountAt({ ...base, window: { from: "2026-09-01", until: "2026-09-11" } })).toBe(R * 10n));
});

describe("FR-LAD-009: the ratio is of the LAD amount, never the contract sum", () => {
  it("40% and 25% of 8,081.40", () => {
    expect(ratioPercentText(waiverRatio(parseSen("3232.56"), parseSen("8081.40")))).toBe("40.00");
    expect(ratioPercentText(waiverRatio(parseSen("2020.35"), parseSen("8081.40")))).toBe("25.00");
  });
});

describe("recording a waiver", () => {
  const ok = { decision: { charging: true, label: "the decision of 1 September 2026" }, waived: parseSen("2020.35"), ladAmount: parseSen("8081.40"), reason: "The contractor's delay was partly due to the authority's late approval.", asOf: "2026-09-30", today: "2026-09-30" };
  it("passes", () => expect(waiverRecordFaults(ok)).toEqual([]));
  it("of a live decision charging damages, more than nothing and not more than the LAD amount, with a reason, never ahead of today", () => {
    expect(codes(waiverRecordFaults({ ...ok, decision: null }))).toEqual(["DECISION_NOT_CHARGING"]);
    expect(codes(waiverRecordFaults({ ...ok, decision: { charging: false, label: "x" } }))).toEqual(["DECISION_NOT_CHARGING"]);
    expect(codes(waiverRecordFaults({ ...ok, ladAmount: 0n }))).toEqual(["NO_LAD_AMOUNT"]);
    expect(codes(waiverRecordFaults({ ...ok, waived: 0n }))).toEqual(["WAIVED_REQUIRED"]);
    expect(codes(waiverRecordFaults({ ...ok, waived: parseSen("8081.41") }))).toEqual(["WAIVED_REQUIRED"]);
    expect(waiverRecordFaults({ ...ok, waived: parseSen("8081.40") })).toEqual([]);
    expect(codes(waiverRecordFaults({ ...ok, reason: "" }))).toEqual(["WAIVER_REASON_REQUIRED"]);
    expect(codes(waiverRecordFaults({ ...ok, asOf: "2026-10-01" }))).toEqual(["FUTURE_DATE"]);
  });
});

describe("OD-B7 (BD-613-75): when an approved waiver reaches the money", () => {
  const frozen = { amount: parseSen("8081.40"), extensions: [], supersededBy: null, segments: "269.38" };
  const now = { amount: parseSen("8081.40"), extensions: [], supersededBy: null, segments: "269.38" };
  it("NEXT_CERTIFICATE applies an approved, unapplied waiver whose basis has not moved", () => expect(applicationOf({ setting: "NEXT_CERTIFICATE", approved: true, applied: false, frozen, now })).toEqual({ state: "APPLY" }));
  it("unset: approved, not applied (said, never applied)", () => expect(applicationOf({ setting: null, approved: true, applied: false, frozen, now })).toEqual({ state: "NOT_SET" }));
  it("FINAL_ACCOUNT: held for the final account", () => expect(applicationOf({ setting: "FINAL_ACCOUNT", approved: true, applied: false, frozen, now })).toEqual({ state: "AT_FINAL" }));
  it("not approved, or applied already: nothing", () => {
    expect(applicationOf({ setting: "NEXT_CERTIFICATE", approved: false, applied: false, frozen, now })).toEqual({ state: "NOT_APPROVED" });
    expect(applicationOf({ setting: "NEXT_CERTIFICATE", approved: true, applied: true, frozen, now })).toEqual({ state: "APPLIED" });
  });
  it("the basis moved since it was sent (a credit, a supersession, an occupation segment): LAD_BASIS_MOVED, naming what moved", () => {
    const moved = applicationOf({ setting: "NEXT_CERTIFICATE", approved: true, applied: false, frozen, now: { amount: parseSen("4310.08"), extensions: [{ id: "e1", number: "EOT/1" }], supersededBy: "EOT/1", segments: "269.38" } });
    expect(moved.state).toBe("MOVED");
    if (moved.state === "MOVED") {
      expect(moved.fault).toEqual({ code: "LAD_BASIS_MOVED", level: "block", data: { then: "8081.40", now: "4310.08", moved: "the extension of time EOT/1 issued; the decision was superseded by EOT/1" } });
    }
    const seg = applicationOf({ setting: "NEXT_CERTIFICATE", approved: true, applied: false, frozen, now: { ...now, segments: "269.38 to 9 Sep 2026; 215.50 from it" } });
    expect(seg.state === "MOVED" && seg.fault.data?.moved).toBe("an occupation's confirmed rate changed the rate segments");
  });
});
