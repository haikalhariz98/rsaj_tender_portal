import { describe, expect, it } from "vitest";

import { parseSen } from "@/lib/money";

import { advancesMovedFaults, applicationFaults, recoupments, type ApplicationInput } from "./advance";

/// Code review run 2, item 2: interim certificate 2 is being routed (its recoupment fixed from the advances issued
/// when it was raised: none); an advance scheduled on 2 and 3 would have its row 2 skipped for good.
const s = parseSen;
const APG = { kind: "ADVANCE_PAYMENT_GUARANTEE", status: "VERIFIED", effectiveFrom: "2026-01-01", expiresOn: "2027-01-01", value: s("10000.00") };
const app: ApplicationInput = { party: "MAIN", partyKnown: true, amount: s("10000.00"), guarantee: APG, schedule: [{ sequence: 2, amount: s("5000.00") }, { sequence: 3, amount: s("5000.00") }], issuedInterims: 1, liveForParty: false, inProgressSequence: 2, today: "2026-07-01" };
const codes = (i: ApplicationInput) => applicationFaults(i).map((f) => f.code);

describe("an advance applied for while an interim valuation is in progress", () => {
  it("is refused, and a row on that valuation's sequence (or before it) is named", () => {
    expect(codes(app)).toEqual(["ADVANCE_VALUATION_IN_PROGRESS", "SCHEDULE_ON_VALUATION_IN_PROGRESS"]);
    expect(applicationFaults(app)[0].data).toEqual({ sequence: 2 });
  });
  it("a schedule after it is still refused while it is in progress (one fixed recoupment at a time)", () => {
    expect(codes({ ...app, schedule: [{ sequence: 3, amount: s("5000.00") }, { sequence: 4, amount: s("5000.00") }] })).toEqual(["ADVANCE_VALUATION_IN_PROGRESS"]);
  });
  it("once interim 2 is issued and none is in progress, a schedule from 3 is sound; one naming 2 is past", () => {
    expect(codes({ ...app, issuedInterims: 2, inProgressSequence: null, schedule: [{ sequence: 3, amount: s("5000.00") }, { sequence: 4, amount: s("5000.00") }] })).toEqual([]);
    expect(codes({ ...app, issuedInterims: 2, inProgressSequence: null })).toEqual(["SCHEDULE_PAST"]);
  });
});

describe("at issue: the advances read at raising must still be the issued set", () => {
  it("an advance issued after interim 2 was raised refuses its issue, naming the advance (its row 2 would be skipped)", () => {
    // Interim 2 raised with no issued advance: it recoups nothing.
    expect(recoupments([], 2).main).toBe(0n);
    // The advance scheduled on 2 and 3 then issues: interim 2's issue is refused.
    const f = advancesMovedFaults([], [{ id: "a1", label: "the advance to the main contractor of RM10,000.00" }]);
    expect(f).toEqual([{ code: "ADVANCES_MOVED", level: "block", data: { added: "the advance to the main contractor of RM10,000.00", gone: 0 } }]);
    // Raised again, it reads the advance and recoups row 2.
    expect(recoupments([{ id: "a1", party: "MAIN", amount: s("10000.00"), schedule: app.schedule, recouped: 0n }], 2).main).toBe(s("5000.00"));
  });
  it("the same set issues; an advance no longer issued refuses too", () => {
    expect(advancesMovedFaults(["a1"], [{ id: "a1", label: "x" }])).toEqual([]);
    expect(advancesMovedFaults(["a1"], [])).toEqual([{ code: "ADVANCES_MOVED", level: "block", data: { added: null, gone: 1 } }]);
  });
});
