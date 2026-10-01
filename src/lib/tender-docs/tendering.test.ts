import { describe, expect, it } from "vitest";

import { rejectionOutcome } from "@/lib/authority/rejection";
import type { Matrix, Rule } from "@/lib/authority/types";
import { hasMatterLabel, matterLabel } from "@/lib/labels";
import type { FunderContext, RequesterOnName } from "@/lib/method/approval";
import { SPEC_MATRIX, SPEC_METHODS } from "@/lib/method/fixture";
import type { Method } from "@/lib/method/types";

import { approvalDatesFault, estimateLeadWarning, resolveTendering, returnOutcome, TENDERING_DOMAIN, tenderingRejectionSnapshot, tenderingRouteForRequester, timeIn, zonedInstant } from "./tendering";

/**
 * FR-DOC-012: Approval for Tendering routes through the engine under its own domain, from
 * the customer's rows (none shipped). Here an invented test row: Contract & Procurement
 * approves a quotation's documents. The approving step records start and closing (X-2).
 */

const m = (code: string): Method => SPEC_METHODS.find((x) => x.code === code)!;
const tenderingRule: Rule = { ...SPEC_MATRIX.rules[0], ruleKey: "TEND_Q", domain: TENDERING_DOMAIN, method: "quotation", minValue: null, maxValue: null, followsBoundarySwitch: null, recommenders: [], approverCode: "CP", labelEn: "Approval for tendering, quotation", clause: "TEST 4.1" };
const withRows = (rules: Rule[]): FunderContext => ({ dal: { ...SPEC_MATRIX, rules: [...SPEC_MATRIX.rules, ...rules] } as Matrix, override: null, supersedes: false });
// Someone other than the requester holds every office.
const nobody: RequesterOnName = { id: "req", holds: () => false, ableToAct: () => ({ holderIds: ["other"], delegateIds: [] }) };

describe("the route, from configuration only", () => {
  it("the domain reads as words wherever a rule is shown, never its key", () => {
    expect(hasMatterLabel(TENDERING_DOMAIN)).toBe(true);
    expect(matterLabel(TENDERING_DOMAIN)).toBe("Approval for Tendering");
  });
  it("with no rows for the domain, nothing routes it and it says so, never a guessed approver", () => {
    const r = resolveTendering(withRows([]), m("open_quotation"), 100_000);
    expect(r.tenderingState).toBe("NO_RULE");
    expect(r.approverCode).toBeNull();
  });
  it("a configured row routes it to the office the row names", () => {
    const r = resolveTendering(withRows([tenderingRule]), m("open_quotation"), 100_000);
    expect(r.tenderingState).toBe("RESOLVED");
    expect(r.approverCode).toBe("CP");
    expect(r.chain.map((s) => `${s.roleCode}:${s.act}`)).toEqual(["CP:A"]);
  });
  it("a method with no authority key cannot be routed", () => {
    expect(resolveTendering(withRows([tenderingRule]), { ...m("open_quotation"), authorityMethodKey: null }, 100_000).tenderingState).toBe("NO_METHOD_KEY");
  });
  it("a route with a committee step is refused, as the name's is (no exercise tabling yet)", () => {
    const committee: Rule = { ...tenderingRule, recommenders: [{ roleCode: "QC", act: "MR" }], committeeCode: "QC", committeeAct: "MR" };
    expect(resolveTendering(withRows([committee]), m("open_quotation"), 100_000).tenderingState).toBe("HAS_COMMITTEE_STEP");
  });
  it("the requester holding the approving office with nowhere to escalate is refused, naming the setting", () => {
    const r = tenderingRouteForRequester(withRows([tenderingRule]), m("open_quotation"), 100_000, { ...nobody, holds: (c) => c === "CP" });
    expect(r.refusal).toMatch(/approves tendering \(Contract & Procurement\)/);
    expect(tenderingRouteForRequester(withRows([tenderingRule]), m("open_quotation"), 100_000, nobody).refusal).toBeNull();
    // Only the requester able to act for the approving step: refused, naming the way out.
    expect(tenderingRouteForRequester(withRows([tenderingRule]), m("open_quotation"), 100_000, { ...nobody, ableToAct: () => ({ holderIds: ["req"], delegateIds: [] }) }).refusal).toMatch(/requester is the only officer able to act as Contract & Procurement/);
  });
});

describe("Q-3: a rejection returns the documents for amendment", () => {
  it("the route snapshots a return to the originator, STATED", () => {
    const at = new Date("2026-10-01T03:00:00Z");
    expect(tenderingRejectionSnapshot(at)).toEqual({ rejectionSnapshotAt: at, rejectionDestinationId: null, rejectionKind: "RETURN_TO_ORIGINATOR", rejectionReturnToRoleCode: null, rejectionProvenance: "STATED" });
  });
  it("the outcome is always the return, and the engine reads the snapshot the same way", () => {
    expect(returnOutcome().apply).toBe("RETURN_TO_ORIGINATOR");
    const engine = rejectionOutcome({ snapshot: { snapshotAt: new Date(), kind: "RETURN_TO_ORIGINATOR", returnToRoleCode: null }, committee: null, steps: [{ sequence: 1, roleCode: "CP" }], rejectingSeq: 1, supports: ["RETURN_TO_ORIGINATOR"] });
    expect(engine).toEqual({ apply: "RETURN_TO_ORIGINATOR", source: "CONFIGURED" });
  });
});

describe("X-2: the start and closing the approving step records", () => {
  const tz = "Asia/Kuala_Lumpur";
  const ok = { startOn: "2026-10-12", closingDay: "2026-10-29", closingTime: "14:30", timeZone: tz, today: "2026-10-01" };
  const codes = (x: ReturnType<typeof approvalDatesFault>) => x.faults.map((f) => f.code);

  it("14:30 on 29 October in Kuala Lumpur (UTC+8) is 06:30 UTC", () => {
    const r = approvalDatesFault(ok);
    expect(r.faults).toEqual([]);
    expect(r.closingAt?.toISOString()).toBe("2026-10-29T06:30:00.000Z");
    expect(timeIn(r.closingAt!, tz)).toBe("14:30");
  });
  it("a zone with daylight saving converts on its own clock", () => {
    expect(zonedInstant("2026-07-01", "09:00", "Europe/London").toISOString()).toBe("2026-07-01T08:00:00.000Z");
    expect(zonedInstant("2026-12-01", "09:00", "Europe/London").toISOString()).toBe("2026-12-01T09:00:00.000Z");
  });
  it("an unset time zone blocks, never UTC's day", () => {
    expect(codes(approvalDatesFault({ ...ok, timeZone: null }))).toEqual(["TIME_ZONE_NOT_SET"]);
  });
  it("both dates and the closing time are required, and must be real", () => {
    expect(codes(approvalDatesFault({ ...ok, startOn: null }))).toEqual(["DATES_REQUIRED"]);
    expect(codes(approvalDatesFault({ ...ok, closingTime: "" }))).toEqual(["DATES_REQUIRED"]);
    expect(codes(approvalDatesFault({ ...ok, closingTime: "24:00" }))).toEqual(["CLOSING_TIME_NOT_VALID"]);
    expect(codes(approvalDatesFault({ ...ok, closingDay: "29/10/2026" }))).toEqual(["DATE_NOT_VALID"]);
  });
  it("the start may be today, not before; closing must be after the start day", () => {
    expect(codes(approvalDatesFault({ ...ok, startOn: "2026-10-01" }))).toEqual([]);
    expect(codes(approvalDatesFault({ ...ok, startOn: "2026-09-30" }))).toEqual(["START_IN_PAST"]);
    expect(codes(approvalDatesFault({ ...ok, closingDay: "2026-10-12" }))).toEqual(["CLOSING_NOT_AFTER_START"]);
    expect(codes(approvalDatesFault({ ...ok, closingDay: "2026-10-13" }))).toEqual([]);
  });
});

describe("6.2's estimate lead, read against the closing at approval: a warning, never a refusal", () => {
  const closingAt = new Date("2026-10-29T06:30:00Z");
  it("lodged on or before the closing day less the lead is ready", () => {
    expect(estimateLeadWarning("2026-10-22", closingAt, { estimateLeadDays: 7 }, "Asia/Kuala_Lumpur")).toMatchObject({ state: "READY", warn: false });
  });
  it("after it, or with no lead set, it warns", () => {
    expect(estimateLeadWarning("2026-10-23", closingAt, { estimateLeadDays: 7 }, "Asia/Kuala_Lumpur")).toMatchObject({ state: "LATE", warn: true });
    expect(estimateLeadWarning("2026-10-01", closingAt, { estimateLeadDays: null }, "Asia/Kuala_Lumpur")).toMatchObject({ state: "LEAD_NOT_SET", warn: true });
  });
});
