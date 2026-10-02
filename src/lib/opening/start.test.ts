import { describe, expect, it } from "vitest";

import { leadTime } from "@/lib/scope/estimate";

import { estimateLeadFaults, startFaults, supplementaryFaults } from "./start";

/**
 * Starting an opening (FR-OPN-004 preconditions, FR-EST-007) and a supplementary one (FR-CTE-008, OD-5).
 * The estimate's worked example is 6.2's test 5: lead 7, closing 2026-11-19 14:30 KL, last version
 * 13 Nov → LATE, refused without the override.
 */

const ok: Parameters<typeof startFaults>[0] = { status: "ADVERTISED", packKind: "TENDER", publishedThroughWindow: true, timeZone: "Asia/Kuala_Lumpur", phase: "CLOSED", boxLocked: true, changePending: false, mainExists: false, personActive: true };
const codes = (x: Partial<typeof ok>) => startFaults({ ...ok, ...x }).map((f) => f.code);

describe("starting the main opening", () => {
  it("passes once closed, the box locked, nothing pending", () => expect(codes({})).toEqual([]));
  it("each precondition refuses by name", () => {
    expect(codes({ phase: "CLOSED_FOR_PURCHASE" })).toEqual(["NOT_CLOSED"]);
    expect(codes({ boxLocked: false })).toEqual(["BOX_NOT_LOCKED"]);
    expect(codes({ changePending: true })).toEqual(["CHANGE_PENDING"]);
    expect(codes({ mainExists: true })).toEqual(["MAIN_EXISTS"]);
    expect(codes({ timeZone: null })).toEqual(["TIME_ZONE_NOT_SET"]);
    expect(codes({ publishedThroughWindow: false })).toEqual(["NOT_PUBLISHED"]);
    expect(codes({ packKind: "NONE" })).toEqual(["NO_TENDER_DOCUMENTS"]);
    expect(codes({ personActive: false })).toEqual(["PERSON_REQUIRED"]);
    expect(codes({ status: "CANCELLED" })).toEqual(["CANCELLED"]);
  });
});

describe("the estimate's lead time (FR-EST-007)", () => {
  const closing = new Date("2026-11-19T06:30:00.000Z");
  const late = leadTime("2026-11-13", closing, { estimateLeadDays: 7 }, "Asia/Kuala_Lumpur");
  const base = { requires: true, estimateState: "LODGED" as const, lead: late, override: null, overrideRoleCode: "HOD_CP" };

  it("6.2 test 5: lead 7, closing 19 Nov, last version 13 Nov → LATE, refused", () => {
    expect(late.state).toBe("LATE");
    const r = estimateLeadFaults(base);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.faults.map((f) => f.code)).toEqual(["ESTIMATE_LATE"]);
  });
  it("with the override office set, held by the Person, and a reason → passes as OVERRIDDEN (the LATE_OVERRIDE event)", () => {
    const r = estimateLeadFaults({ ...base, override: { personId: "p3", holdsOverrideRole: true, reason: "Re-priced after the last addendum" } });
    expect(r).toMatchObject({ ok: true, outcome: "OVERRIDDEN" });
  });
  it("the override office unset → OVERRIDE_NOT_PERMITTED; not the holder, no reason, refused", () => {
    const r = estimateLeadFaults({ ...base, overrideRoleCode: null, override: { personId: "p3", holdsOverrideRole: true, reason: "x" } });
    expect(r.ok ? [] : r.faults.map((f) => f.code)).toEqual(["OVERRIDE_NOT_PERMITTED"]);
    const r2 = estimateLeadFaults({ ...base, override: { personId: "p3", holdsOverrideRole: false, reason: " " } });
    expect(r2.ok ? [] : r2.faults.map((f) => f.code)).toEqual(["NOT_HOLDER", "REASON_REQUIRED"]);
  });
  it("in time → READY; the lead unset blocks naming the setting", () => {
    expect(estimateLeadFaults({ ...base, lead: leadTime("2026-11-12", closing, { estimateLeadDays: 7 }, "Asia/Kuala_Lumpur") })).toMatchObject({ ok: true, outcome: "READY" });
    const r = estimateLeadFaults({ ...base, lead: leadTime("2026-11-12", closing, { estimateLeadDays: null }, "Asia/Kuala_Lumpur") });
    expect(r.ok ? [] : r.faults.map((f) => f.code)).toEqual(["LEAD_NOT_SET"]);
  });
  it("required but none lodged blocks; the requirement unset blocks", () => {
    const r = estimateLeadFaults({ ...base, estimateState: "DRAFT" });
    expect(r.ok ? [] : r.faults.map((f) => f.code)).toEqual(["ESTIMATE_NOT_LODGED"]);
    const r2 = estimateLeadFaults({ ...base, requires: null });
    expect(r2.ok ? [] : r2.faults.map((f) => f.code)).toEqual(["ESTIMATE_RULE_NOT_SET"]);
  });
  it("a method needing none: NOT_REQUIRED (no benchmark row), or VOLUNTARY where one was lodged, never blocking (62-C5)", () => {
    expect(estimateLeadFaults({ ...base, requires: false, estimateState: null })).toMatchObject({ ok: true, outcome: "NOT_REQUIRED" });
    expect(estimateLeadFaults({ ...base, requires: false })).toMatchObject({ ok: true, outcome: "VOLUNTARY" });
  });
});

describe("a supplementary opening (FR-CTE-008, OD-5)", () => {
  const s: Parameters<typeof supplementaryFaults>[0] = { status: "OPENED", mainFinalised: true, decision: { matterKind: "LATE_TENDER", outcome: "CARRIED", bidEnvelopeId: "e4" }, alreadyOpened: false, envelope: { status: "RECEIVED", late: true }, personActive: true, timeZone: "Asia/Kuala_Lumpur" };
  const codes = (x: Partial<typeof s>) => supplementaryFaults({ ...s, ...x }).map((f) => f.code);
  it("a carried admission, after the main opening is finalised", () => expect(codes({})).toEqual([]));
  it("NOT_CARRIED leaves the envelope sealed for 6.6's return unopened", () => expect(codes({ decision: { ...s.decision!, outcome: "NOT_CARRIED" } })).toEqual(["NOT_ADMITTED"]));
  it("before the main opening is finalised, twice for one admission, or on another matter: refused", () => {
    expect(codes({ mainFinalised: false })).toEqual(["MAIN_NOT_FINALISED"]);
    expect(codes({ alreadyOpened: true })).toEqual(["ALREADY_OPENED_FOR"]);
    expect(codes({ decision: { matterKind: "EXERCISE", outcome: "CARRIED", bidEnvelopeId: null } })).toEqual(["DECISION_NOT_LATE_TENDER"]);
  });
});
