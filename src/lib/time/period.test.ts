import { describe, expect, it } from "vitest";

import { periodMovedFaults, periodRecordFaults, periodSendFaults, PERIOD_PRECONDITIONS } from "./period";

/** 6.13 Part B run 1b: the extension of the contract period (FR-EOT-011, 012, 013). Pure. */

const codes = (fs: readonly { code: string }[]) => fs.map((f) => f.code);
const all = { priorAgreement: true, termsRetained: true, ratesRetained: true, performanceSatisfactory: true, spanConfirmed: true };

describe("recording a period extension", () => {
  const ok = { instrument: [], currentExpiry: "2026-12-31", newExpiry: "2027-06-30", reason: "The service is still needed.", financialImpact: null };
  it("passes", () => expect(periodRecordFaults(ok)).toEqual([]));
  it("the new expiry is after the current one; a reason; the type's instrument (carried); no value band assumed", () => {
    expect(codes(periodRecordFaults({ ...ok, newExpiry: "2026-12-31" }))).toEqual(["NEW_EXPIRY_NOT_LATER"]);
    expect(codes(periodRecordFaults({ ...ok, currentExpiry: null }))).toEqual(["NO_DATE_FOR_COMPLETION"]);
    expect(codes(periodRecordFaults({ ...ok, reason: "" }))).toEqual(["PERIOD_REASON_REQUIRED"]);
    expect(codes(periodRecordFaults({ ...ok, instrument: [{ code: "PERIOD_NOT_OFFERED", level: "block" }] }))).toEqual(["PERIOD_NOT_OFFERED"]);
    expect(codes(periodRecordFaults({ ...ok, financialImpact: -1n }))).toEqual(["FINANCIAL_IMPACT_BELOW_NOTHING"]);
  });
});

describe("FR-EOT-011: any precondition false or SPAN unconfirmed → refused before send; nothing is assumed", () => {
  it("the four preconditions and SPAN's compliance", () => expect([...PERIOD_PRECONDITIONS]).toEqual(["priorAgreement", "termsRetained", "ratesRetained", "performanceSatisfactory", "spanConfirmed"]));
  it("all confirmed passes", () => expect(periodSendFaults(all)).toEqual([]));
  it("each one false refuses, naming it", () => {
    for (const p of PERIOD_PRECONDITIONS) {
      const f = periodSendFaults({ ...all, [p]: false });
      expect(f, p).toEqual([{ code: "PRECONDITION_NOT_MET", level: "block", data: { precondition: p } }]);
    }
  });
});

describe("two agreements on one contract (both orders)", () => {
  it("the period moved since the agreement was raised: its issue refused PERIOD_MOVED", () => {
    expect(periodMovedFaults("2026-12-31", "2026-12-31")).toEqual([]);
    expect(periodMovedFaults("2026-12-31", "2027-03-31")).toEqual([{ code: "PERIOD_MOVED", level: "block", data: { day: "2027-03-31" } }]);
  });
});
