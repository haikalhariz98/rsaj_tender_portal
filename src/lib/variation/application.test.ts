import { describe, expect, it } from "vitest";

import { parseSen } from "@/lib/money";

import { approvedValue, closeFaults, commenceFaults, commencedPending, cumulativeApproved, fieldFaults, newSumOf, originFaults, pendingValueRoutes, priorValueOf, routeValue, scheduleFormOf, sendFaults, soDecisionFaults, stageOf, submitFaults, type ApplicationFields, type OriginFacts, type RouteFact, type VariationFacts } from "./application";

/**
 * A variation from origination to approval (FR-VAR-001–006, 008, 013, 014, 024; VO-660 §3.5–3.6). Invented fixtures.
 */

const S = parseSen;
const route = (event: RouteFact["event"], status: string, value: string, openedOn = "2026-05-01", applied: string | null = null, choices: string[] = []): RouteFact => ({ id: `${event}-${status}-${openedOn}`, event, status, value: S(value), applied, choices, openedOn });
const v = (x: Partial<VariationFacts> = {}): VariationFacts => ({ id: "v1", status: "SUPPORTED", exemption: null, estimate: S("90000.00"), soDecision: "SUPPORTED", soDecisionCap: null, routes: [], instructions: [], orders: [], commencedOn: null, ...x });
const fields = (x: Partial<ApplicationFields> = {}): ApplicationFields => ({ description: "Additional valve chamber", reason: "Found on site", estimate: S("90000.00"), exemption: null, periodImplication: false, agreedRateExists: false, funderConsentRequired: false, ...x });
const codes = (fs: { code: string }[]) => fs.map((f) => f.code);

describe("FR-VAR-003: the application's fields", () => {
  it("every typed field is required, and each is named", () => {
    expect(codes(fieldFaults({ description: " ", reason: "", estimate: null, exemption: null, periodImplication: null, agreedRateExists: null, funderConsentRequired: null }))).toEqual(["FIELD_REQUIRED", "FIELD_REQUIRED", "FIELD_REQUIRED", "FIELD_REQUIRED", "FIELD_REQUIRED", "FIELD_REQUIRED"]);
    expect(fieldFaults(fields())).toEqual([]);
  });
  it("FR-VAR-004: a reduction is an omission (below nothing), and an omission is only ever a reduction", () => {
    expect(codes(fieldFaults(fields({ exemption: "REDUCTION", estimate: S("5000.00") })))).toEqual(["REDUCTION_NOT_OMISSION"]);
    expect(fieldFaults(fields({ exemption: "REDUCTION", estimate: S("-5000.00") }))).toEqual([]);
    expect(codes(fieldFaults(fields({ estimate: S("-5000.00") })))).toEqual(["OMISSION_IS_REDUCTION"]);
    expect(codes(fieldFaults(fields({ exemption: "PC_SUM", estimate: S("-5000.00") })))).toEqual(["OMISSION_IS_REDUCTION"]);
    expect(codes(fieldFaults(fields({ estimate: 0n })))).toEqual(["ESTIMATE_ZERO"]);
  });
});

describe("FR-VAR-001, 002: origination", () => {
  const o = (x: Partial<OriginFacts>): OriginFacts => ({ origin: "SO_REPRESENTATIVE", originatorCapacity: { as: "DELEGATE", kind: "PRINCIPAL" }, reviewerCapacity: null, reviewRecorded: false, allocationConfirmed: null, principalRecorded: false, ...x });
  it("the department path is reviewed by a representative before submission", () => {
    expect(codes(originFaults(o({ origin: "DEPARTMENT" })))).toEqual(["REVIEW_NOT_RECORDED"]);
    expect(codes(originFaults(o({ origin: "DEPARTMENT", reviewRecorded: true, reviewerCapacity: null })))).toEqual(["REVIEWER_NOT_REPRESENTATIVE"]);
    expect(originFaults(o({ origin: "DEPARTMENT", reviewRecorded: true, reviewerCapacity: { as: "SO" } }))).toEqual([]);
  });
  it("a representative directly, or the S.O.: the paths are distinguishable", () => {
    expect(originFaults(o({}))).toEqual([]);
    expect(codes(originFaults(o({ originatorCapacity: null })))).toEqual(["ORIGINATOR_NOT_REPRESENTATIVE"]);
  });
  it("a Specialist confirms the allocation and passes it through a Principal Representative", () => {
    expect(codes(originFaults(o({ originatorCapacity: { as: "DELEGATE", kind: "SPECIALIST" } })))).toEqual(["ALLOCATION_NOT_CONFIRMED", "PRINCIPAL_NOT_RECORDED"]);
    expect(codes(originFaults(o({ originatorCapacity: { as: "DELEGATE", kind: "SPECIALIST_QS" }, allocationConfirmed: true })))).toEqual(["PRINCIPAL_NOT_RECORDED"]);
    expect(originFaults(o({ originatorCapacity: { as: "DELEGATE", kind: "SPECIALIST" }, allocationConfirmed: true, principalRecorded: true }))).toEqual([]);
  });
  it("only a draft is submitted", () => {
    expect(codes(submitFaults({ status: "SUBMITTED", fields: fields(), origin: o({}) }))).toEqual(["NOT_DRAFT"]);
    expect(submitFaults({ status: "DRAFT", fields: fields(), origin: o({}) })).toEqual([]);
  });
});

describe("FR-VAR-024, VO-660 §3.5–3.6: the cumulative and the new sum", () => {
  it("cumulative = every other variation's approved value (the prior approval at the cap, plus approved increases); exempt and unapproved count nothing", () => {
    const all = [
      v({ id: "a", routes: [route("PRIOR", "APPROVED", "60000.00"), route("INCREASE", "APPROVED", "5000.00"), route("INCREASE", "REJECTED", "9000.00")] }),
      v({ id: "b", routes: [route("PRIOR", "PENDING", "30000.00")] }),
      v({ id: "c", exemption: "PC_SUM", routes: [] }),
      v({ id: "d", status: "CLOSED", routes: [] }),
      v({ id: "e", routes: [route("PRIOR", "APPROVED", "10000.00")] }),
    ];
    expect(cumulativeApproved(all, "e")).toBe(S("65000.00"));
    expect(cumulativeApproved(all, null)).toBe(S("75000.00"));
  });
  it("new sum = contract sum + cumulative approved + this (fixture: 750,000.00 + 65,000.00 + 90,000.00)", () => {
    expect(newSumOf(S("750000.00"), S("65000.00"), S("90000.00"))).toBe(S("905000.00"));
  });
  it("the prior approval is sought at the S.O.'s cap where set", () => {
    expect(priorValueOf({ estimate: S("90000.00"), soDecisionCap: S("80000.00") })).toBe(S("80000.00"));
    expect(priorValueOf({ estimate: S("90000.00"), soDecisionCap: null })).toBe(S("90000.00"));
  });
});

describe("FR-VAR-005: the S.O.'s decision", () => {
  const base = { status: "SUBMITTED" as const, exemption: null, decision: "SUPPORTED" as const, cap: null, estimate: S("90000.00"), note: "", decidedOn: "2026-05-02", submittedOn: "2026-05-01", today: "2026-05-03" };
  it("supported, with a cap no higher than the estimate", () => {
    expect(soDecisionFaults(base)).toEqual([]);
    expect(soDecisionFaults({ ...base, cap: S("90000.00") })).toEqual([]);
    expect(codes(soDecisionFaults({ ...base, cap: S("90000.01") }))).toEqual(["CAP_OUT_OF_RANGE"]);
  });
  it("not supported needs its reason; a cap only with support; never in the future or before submission", () => {
    expect(codes(soDecisionFaults({ ...base, decision: "NOT_SUPPORTED" }))).toEqual(["NOT_SUPPORTED_REASON"]);
    expect(codes(soDecisionFaults({ ...base, decision: "NOT_SUPPORTED", note: "Not needed", cap: S("1.00") }))).toEqual(["CAP_ONLY_ON_SUPPORT"]);
    expect(codes(soDecisionFaults({ ...base, decidedOn: "2026-05-04" }))).toEqual(["FUTURE_DATE"]);
    expect(codes(soDecisionFaults({ ...base, decidedOn: "2026-04-30" }))).toEqual(["BEFORE_SUBMITTED"]);
  });
  it("an exempt variation has no S.O. decision on an application", () => {
    expect(codes(soDecisionFaults({ ...base, exemption: "PC_SUM" }))).toEqual(["NOT_WITH_SO"]);
  });
});

describe("FR-VAR-008: sending each approval", () => {
  const s = (x: Partial<Parameters<typeof sendFaults>[0]>) => codes(sendFaults({ v: v(), event: "PRIOR", value: null, cumulativeBlockedBy: null, adjustmentInProgress: null, orderNet: null, ...x }));
  it("prior approval once supported; one route at a time; a refusal awaiting its destination first", () => {
    expect(s({})).toEqual([]);
    expect(s({ v: v({ status: "SUBMITTED" }) })).toEqual(["NOT_SUPPORTED_YET"]);
    expect(s({ v: v({ routes: [route("PRIOR", "PENDING", "90000.00")] }) })).toEqual(["ROUTE_PENDING"]);
    expect(s({ v: v({ routes: [route("PRIOR", "REJECTED", "90000.00", "2026-05-01", null, ["RETURN_TO_ORIGINATOR"])] }) })).toEqual(["AWAITING_CHOICE"]);
    expect(s({ v: v({ routes: [route("PRIOR", "REJECTED", "90000.00", "2026-05-01", "RETURN_TO_ORIGINATOR")] }) })).toEqual([]);
    expect(s({ v: v({ routes: [route("PRIOR", "APPROVED", "90000.00")] }) })).toEqual(["PRIOR_ALREADY_APPROVED"]);
    expect(s({ v: v({ exemption: "PC_SUM" }) })).toEqual(["EXEMPT_NO_PRIOR"]);
  });
  it("an increase only above what is approved, from the order raised", () => {
    const approved = v({ routes: [route("PRIOR", "APPROVED", "90000.00")] });
    expect(s({ v: approved, event: "INCREASE" })).toEqual(["ORDER_NOT_RAISED"]);
    expect(s({ v: approved, event: "INCREASE", orderNet: S("90000.00") })).toEqual(["NO_INCREASE"]);
    expect(s({ v: approved, event: "INCREASE", orderNet: S("95000.00") })).toEqual([]);
    expect(routeValue(approved, "INCREASE", null, S("95000.00"))).toBe(S("5000.00"));
  });
  it("agreed rates with their amount; a re-measurement at the order's net, either way", () => {
    expect(s({ v: v({ routes: [route("PRIOR", "APPROVED", "90000.00")] }), event: "AGREED_RATE" })).toEqual(["VALUE_REQUIRED"]);
    const rm = v({ exemption: "REMEASUREMENT", soDecision: null });
    expect(s({ v: rm, event: "REMEASUREMENT", orderNet: S("-35000.00") })).toEqual([]);
    expect(routeValue(rm, "REMEASUREMENT", null, S("-35000.00"))).toBe(S("35000.00"));
    expect(s({ v: v(), event: "REMEASUREMENT", orderNet: S("1.00") })).toEqual(["NOT_REMEASUREMENT"]);
  });
  it("OD-A2 both orders: a cumulative reading waits for another value route; a revised base for an adjustment in progress", () => {
    expect(s({ cumulativeBlockedBy: "VO/2026/0002" })).toEqual(["CUMULATIVE_ROUTE_PENDING"]);
    expect(s({ event: "AGREED_RATE", v: v({ routes: [route("PRIOR", "APPROVED", "90000.00")] }), value: S("1000.00"), cumulativeBlockedBy: "VO/2026/0002" })).toEqual([]);
    expect(s({ adjustmentInProgress: "the adjustment certificate in draft" })).toEqual(["ADJUSTMENT_IN_PROGRESS"]);
    const all = [v({ id: "a", routes: [route("PRIOR", "PENDING", "1.00")] }), v({ id: "b", routes: [route("AGREED_RATE", "PENDING", "1.00")] })];
    expect(pendingValueRoutes(all, "x")).toEqual([{ variationId: "a", event: "PRIOR" }]);
    expect(pendingValueRoutes(all, "a")).toEqual([]);
  });
});

describe("the stage, read from the records", () => {
  it("each stage", () => {
    expect(stageOf(v({ status: "DRAFT" }))).toBe("DRAFT");
    expect(stageOf(v({ status: "SUBMITTED" }))).toBe("WITH_SO");
    expect(stageOf(v())).toBe("TO_SEND");
    expect(stageOf(v({ routes: [route("PRIOR", "PENDING", "1.00")] }))).toBe("AWAITING_APPROVAL");
    expect(stageOf(v({ routes: [route("PRIOR", "REJECTED", "1.00", "2026-05-01", null, ["TERMINATE"])] }))).toBe("REFUSED_AWAITING_CHOICE");
    expect(stageOf(v({ routes: [route("PRIOR", "APPROVED", "1.00")] }))).toBe("APPROVED");
    expect(stageOf(v({ exemption: "PC_SUM" }))).toBe("EXEMPT");
    expect(stageOf(v({ instructions: [{ id: "i", certificateStatus: "ISSUED" }] }))).toBe("INSTRUCTED");
    expect(stageOf(v({ orders: [{ id: "o", certificateStatus: "ISSUED", net: 1n }] }))).toBe("CERTIFIED");
    expect(stageOf(v({ status: "CLOSED" }))).toBe("CLOSED");
  });
});

describe("FR-VAR-014: commenced pending approval", () => {
  const c = (x: Partial<Parameters<typeof commenceFaults>[0]>) => codes(commenceFaults({ v: v(), on: "2026-05-05", today: "2026-05-06", soDecidedOn: "2026-05-02", supporterCapable: true, ...x }));
  it("only on recorded support, before approval, once", () => {
    expect(c({})).toEqual([]);
    expect(c({ supporterCapable: false })).toEqual(["SUPPORT_NOT_SO"]);
    expect(c({ v: v({ status: "SUBMITTED" }) })).toEqual(["NOT_SUPPORTED_YET"]);
    expect(c({ v: v({ commencedOn: "2026-05-04" }) })).toEqual(["ALREADY_COMMENCED"]);
    expect(c({ on: "2026-05-01" })).toEqual(["BEFORE_SUPPORTED"]);
  });
  it("its exposure ends with approval", () => {
    expect(commencedPending(v({ commencedOn: "2026-05-05" }))).toBe(true);
    expect(commencedPending(v({ commencedOn: "2026-05-05", routes: [route("PRIOR", "APPROVED", "1.00")] }))).toBe(false);
  });
});

describe("closing, and the schedule form (OD-A5)", () => {
  it("never once approved, with a route waiting or an instruction raised; with a reason", () => {
    expect(codes(closeFaults({ v: v(), reason: "" }))).toEqual(["CLOSE_REASON_REQUIRED"]);
    expect(codes(closeFaults({ v: v({ routes: [route("PRIOR", "APPROVED", "1.00")] }), reason: "x" }))).toEqual(["CLOSE_APPROVED"]);
    expect(codes(closeFaults({ v: v({ routes: [route("PRIOR", "PENDING", "1.00")] }), reason: "x" }))).toEqual(["CLOSE_ROUTE_PENDING"]);
    expect(codes(closeFaults({ v: v({ instructions: [{ id: "i", certificateStatus: "DRAFT" }] }), reason: "x" }))).toEqual(["CLOSE_INSTRUCTED"]);
    expect(closeFaults({ v: v({ instructions: [{ id: "i", certificateStatus: "VOID" }] }), reason: "x" })).toEqual([]);
  });
  it("the configured rule, either branch; unset is null (blocks the instruction)", () => {
    const rule = { withAgreedRate: "BOTH" as const, withoutAgreedRate: "MEASURED" as const };
    expect(scheduleFormOf(true, rule)).toBe("BOTH");
    expect(scheduleFormOf(false, rule)).toBe("MEASURED");
    expect(scheduleFormOf(false, { withAgreedRate: "BOTH", withoutAgreedRate: null })).toBeNull();
    expect(scheduleFormOf(null, rule)).toBeNull();
  });
  it("approved value of an exempt variation is nothing", () => {
    expect(approvedValue(v({ exemption: "REMEASUREMENT", routes: [route("REMEASUREMENT", "APPROVED", "35000.00")] }))).toBe(0n);
  });
});
