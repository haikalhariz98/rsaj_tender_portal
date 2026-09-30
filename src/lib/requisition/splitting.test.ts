import { describe, expect, it } from "vitest";

import { REQ_MATRIX } from "./fixture";
import { assessSplitting, financialYearOf, splitApprovalFault, splitStateLabel, type SplitPolicy, type SplitSubject } from "./splitting";

const subject = (id: string, raisedOn: string, value: number, over: Partial<SplitSubject> = {}): SplitSubject => ({
  id, reference: id.toUpperCase(), status: "PENDING_APPROVAL", raisedOn, value,
  keys: { unit: "NTH", costCentre: "CC-200", accountCode: "6200200", budgetCode: "b5", contractType: null },
  ...over,
});
const POLICY: SplitPolicy = { windowDays: 45, matchOn: ["unit", "accountCode"], aggregateAcrossYear: null, financialYearStart: null };
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
    expect(r.combinedValue).toBe(48_000);
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
