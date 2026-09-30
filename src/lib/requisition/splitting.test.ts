import { describe, expect, it } from "vitest";

import { REQ_MATRIX } from "./fixture";
import { parseSen } from "@/lib/money";

import { assessSplitting, financialYearOf, justifierFaults, splitApprovalFault, splitStateLabel, type SplitPolicy, type SplitSubject } from "./splitting";

// Values are written in ringgit and held as exact sen, as the action converts them
// (round 3, item f): parseSen of the decimal string, never a float.
const subject = (id: string, raisedOn: string, value: number | string, over: Partial<SplitSubject> = {}): SplitSubject => ({
  id, reference: id.toUpperCase(), status: "PENDING_APPROVAL", raisedOn, value: parseSen(String(value)),
  keys: { unit: "NTH", costCentre: "CC-200", accountCode: "6200200", budgetCode: "b5", contractType: null },
  ...over,
});
// An explicit "window only" (false): unset aggregation is itself NOT_SET (code review, item 3).
const POLICY: SplitPolicy = { windowDays: 45, matchOn: ["unit", "accountCode"], aggregateAcrossYear: false, financialYearStart: null };
const me = subject("a", "2026-09-10", 24_000);

describe("the anti-splitting check (FR-REQ-015)", () => {
  it("is NOT_SET, never CLEAR, while the window or keys are unset (OD-7)", () => {
    expect(assessSplitting(me, [], { ...POLICY, windowDays: null }, REQ_MATRIX)).toMatchObject({ state: "NOT_SET", notSet: ["WINDOW"] });
    expect(assessSplitting(me, [], { ...POLICY, matchOn: [] }, REQ_MATRIX)).toMatchObject({ state: "NOT_SET", notSet: ["MATCH_ON"] });
  });

  it("flags related requisitions within the window, with the total and whether it crosses a band", () => {
    const r = assessSplitting(me, [subject("b", "2026-09-20", 24_000), subject("c", "2026-09-12", 1_000, { keys: { ...me.keys, unit: "CP" } })], POLICY, REQ_MATRIX);
    expect(r.state).toBe("FLAGGED");
    expect(r.related.map((x) => x.id)).toEqual(["b"]);
    expect(r.combinedValue).toBe(parseSen("48000"));
    // RM24,000 and RM48,000 are both in the RM500–RM50,000 band.
    expect(r.crossesBand).toBe(false);
    const big = assessSplitting(subject("a", "2026-09-10", 30_000), [subject("b", "2026-09-20", 30_000)], POLICY, REQ_MATRIX);
    expect(big.crossesBand).toBe(true);
  });

  it("leaves out requisitions outside the window, cancelled or rejected ones, and itself", () => {
    const r = assessSplitting(
      me,
      [
        subject("far", "2026-06-01", 24_000),
        subject("x", "2026-09-11", 24_000, { status: "CANCELLED" }),
        subject("y", "2026-09-11", 24_000, { status: "REJECTED" }),
        { ...me },
      ],
      POLICY,
      REQ_MATRIX,
    );
    expect(r.state).toBe("CLEAR");
  });

  it("aggregates a financial year where set, and needs the year's start to do it", () => {
    const year = { ...POLICY, aggregateAcrossYear: true, financialYearStart: "01-01" };
    expect(assessSplitting(me, [subject("far", "2026-02-01", 5_000)], year, REQ_MATRIX).state).toBe("FLAGGED");
    expect(assessSplitting(me, [], { ...year, financialYearStart: null }, REQ_MATRIX).notSet).toEqual(["FINANCIAL_YEAR"]);
    expect(financialYearOf("2026-03-31", "04-01")).toBe(2025);
  });

  it("needs a justification before a flagged requisition is approved", () => {
    expect(splitApprovalFault({ state: "FLAGGED", overrideJustification: null })).toBe("JUSTIFICATION_REQUIRED");
    expect(splitApprovalFault({ state: "FLAGGED", overrideJustification: "Separate sites" })).toBeNull();
    expect(splitApprovalFault({ state: "NOT_SET", overrideJustification: null })).toBeNull();
  });

  it("reads a stored NOT_SET as not assessed, never as clear", () => {
    expect(splitStateLabel("NOT_SET").label).not.toBe(splitStateLabel("CLEAR").label);
    expect(splitStateLabel("NOT_SET").label).toMatch(/Not assessed/);
  });
});

describe("what the splitting check cannot assess (code review, item 3)", () => {
  it("is NOT_SET, never CLEAR, while year aggregation is unset", () => {
    const r = assessSplitting(me, [], { ...POLICY, aggregateAcrossYear: null }, REQ_MATRIX);
    expect(r).toMatchObject({ state: "NOT_SET", notSet: ["YEAR_AGGREGATION"] });
  });

  it("is NOT_SET, naming the key, where the requisition itself lacks a key it is matched on", () => {
    const noCode = { ...me, keys: { ...me.keys, budgetCode: null } };
    const r = assessSplitting(noCode, [subject("b", "2026-09-20", 24_000)], { ...POLICY, matchOn: ["unit", "budgetCode"] }, REQ_MATRIX);
    expect(r).toMatchObject({ state: "NOT_SET", notSet: ["MISSING_KEY:budgetCode"] });
  });

  it("adds the related values in exact sen", () => {
    const r = assessSplitting(subject("a", "2026-09-10", 0.1), [subject("b", "2026-09-11", 0.2)], POLICY, REQ_MATRIX);
    expect(r.combinedValue).toBe(30n);
  });
});

describe("who may justify a flagged split (ruling Q3)", () => {
  const base = { roleCode: "PROC_HEAD", person: { id: "j", isActive: true }, requesterId: "req", endorserIds: ["e1"], holderIds: ["j", "req", "e1"], on: "2026-09-30", today: "2026-09-30" };

  it("accepts a holder of the justifying office", () => {
    expect(justifierFaults(base)).toEqual([]);
  });

  it("is blocked while the justifying office is not set", () => {
    expect(justifierFaults({ ...base, roleCode: null })).toEqual(["OFFICE_NOT_SET"]);
  });

  it("refuses the requester and any endorser, even holding the office", () => {
    expect(justifierFaults({ ...base, person: { id: "req", isActive: true } })).toContain("REQUESTER");
    expect(justifierFaults({ ...base, person: { id: "e1", isActive: true } })).toContain("ENDORSER");
  });

  it("refuses someone who does not hold the office, and a future date", () => {
    expect(justifierFaults({ ...base, holderIds: [] })).toContain("NOT_HOLDER");
    expect(justifierFaults({ ...base, on: "2026-10-01" })).toContain("FUTURE_DATE");
  });
});

describe("who may justify a possible split: direct holders only (ruling BD-26, round 3)", () => {
  const base = {
    roleCode: "HOD_CP",
    person: { id: "h1", isActive: true },
    requesterId: "req",
    endorserIds: ["e1"],
    holderIds: ["h1"],
    delegateIds: ["d1"],
    on: "2026-09-30",
    today: "2026-09-30",
  };
  it("accepts a direct holder of the office", () => {
    expect(justifierFaults(base)).toEqual([]);
  });
  it("refuses a delegate of the office, saying so", () => {
    expect(justifierFaults({ ...base, person: { id: "d1", isActive: true } })).toEqual(["DELEGATE"]);
  });
  it("refuses someone who neither holds nor is delegated the office as a non-holder", () => {
    expect(justifierFaults({ ...base, person: { id: "x", isActive: true } })).toEqual(["NOT_HOLDER"]);
  });
});

describe("the combined value is exact sen end to end (round 3, item f)", () => {
  it("sums values a float sum gets wrong", () => {
    // As doubles, 0.1 + 0.2 is 0.30000000000000004 and these large amounts lose sen.
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(90071992547409.93 + 0.01).not.toBe(90071992547409.94);
    const r = assessSplitting(
      subject("a", "2026-09-10", "90071992547409.93"),
      [subject("b", "2026-09-11", "0.01"), subject("c", "2026-09-12", "0.1"), subject("d", "2026-09-13", "0.2")],
      POLICY,
      null,
    );
    expect(r.combinedValue).toBe(9007199254740993n + 1n + 10n + 20n);
    expect(r.related.map((x) => x.value)).toEqual([1n, 10n, 20n]);
    expect(typeof r.combinedValue).toBe("bigint");
  });
});
