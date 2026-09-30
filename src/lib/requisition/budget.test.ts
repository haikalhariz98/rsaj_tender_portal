import { describe, expect, it } from "vitest";

import type { BudgetCode, Movement } from "@/lib/budget/codes";

import { dayIn } from "@/lib/dates";

import { ageDay, approvalBudgetFault, approvalBudgetOutcome, approvalCommitment, approvalRechecks, identityHolds, unpostedIntakeReason, intakeCommitment, isStale, ledgerCheck, manualSnapshot, overBudgetDisposition, snapshotFromLedger, verdictFor } from "./budget";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const code: BudgetCode = {
  id: "c1", code: "OPX-1", descriptionEn: "", descriptionMs: null, type: "", owningUnitCode: "NTH", accountCode: "6200200",
  holderPersonId: null, isActive: true, effectiveFrom: d("2026-01-01"), effectiveTo: d("2027-01-01"),
};
const mv = (kind: Movement["kind"], amount: string, on = "2026-02-01"): Movement => ({
  id: kind + amount, budgetCodeId: "c1", kind, reference: "", description: "", amount, occurredOn: d(on), releasedOn: null, releaseNote: "", counterpartCode: null,
});
const LEDGER = [mv("ORIGINAL", "120000.00"), mv("COMMITMENT", "50000.00"), mv("ACTUAL_SPEND", "20000.00")];
const on = d("2026-09-30");

describe("the verdict (FR-REQ-007)", () => {
  it("fits when it exactly exhausts the balance, and not one sen more", () => {
    expect(verdictFor(5_000_000n, 5_000_000n)).toBe("WITHIN");
    expect(verdictFor(5_000_000n, 5_000_001n)).toBe("EXCEEDS");
  });

  it("reads the four figures off the ledger, Approved Account assumed", () => {
    const s = ledgerCheck(code, LEDGER, { accountCode: "6200200", costCentreUnitCode: "NTH", requested: 1_000_000n }, on);
    expect([s.actualBudget, s.balanceAsAt, s.approvedAccount, s.projectedBalance]).toEqual([12_000_000n, 5_000_000n, 7_000_000n, 4_000_000n]);
    expect(s.approvedAccountProvenance).toBe("ASSUMED");
    expect(identityHolds(s)).toBe(true);
    expect(s.verdict).toBe("WITHIN");
  });

  it("never reads Approved Account: altering it leaves the verdict alone", () => {
    const s = snapshotFromLedger({ allocated: 100n, committed: 0n, actualSpend: 0n, available: 100n }, 100n);
    const altered = { ...s, approvedAccount: 999_999n };
    expect(verdictFor(altered.balanceAsAt!, altered.requested)).toBe(s.verdict);
  });

  it("stores hand-entered figures exactly as typed, and does not check the identity on them", () => {
    const s = manualSnapshot({ actualBudget: 100n, balanceAsAt: 30n, approvedAccount: 50n, projectedBalance: 5n }, 25n);
    expect([s.actualBudget, s.balanceAsAt, s.approvedAccount, s.projectedBalance]).toEqual([100n, 30n, 50n, 5n]);
    expect(identityHolds(s)).toBeNull();
    expect(s.verdict).toBe("WITHIN");
  });

  it("finds no budget where there is no code or no allocation, and is ambiguous on another account", () => {
    expect(ledgerCheck(null, [], { accountCode: "x", costCentreUnitCode: null, requested: 1n }, on).verdict).toBe("NO_BUDGET");
    expect(ledgerCheck(code, [], { accountCode: "6200200", costCentreUnitCode: null, requested: 1n }, on).verdict).toBe("NO_BUDGET");
    expect(ledgerCheck(code, LEDGER, { accountCode: "6100100", costCentreUnitCode: null, requested: 1n }, on).verdict).toBe("AMBIGUOUS");
  });

  it("warns, without blocking, on a cost centre outside the code's owning unit", () => {
    const s = ledgerCheck(code, LEDGER, { accountCode: "6200200", costCentreUnitCode: "CP", requested: 1n }, on);
    expect(s.warnings).toEqual(["COST_CENTRE_OUTSIDE_OWNER"]);
    expect(s.verdict).toBe("WITHIN");
  });
});

describe("a stale check", () => {
  it("never goes stale while no re-check window is set", () => {
    expect(isStale("2020-01-01", null, "2026-09-30")).toBe(false);
  });

  it("is not stale at 14 days on a 14-day window, and is at 15", () => {
    expect(isStale("2026-09-16", 14, "2026-09-30")).toBe(false);
    expect(isStale("2026-09-15", 14, "2026-09-30")).toBe(true);
  });
});

describe("over budget (FR-REQ-008, ruling OD-6)", () => {
  it("routes on the over-budget condition in every mode that proceeds", () => {
    for (const [mode, invoked] of [["advisory", false], ["blocking", true], [null, true]] as const) {
      const r = overBudgetDisposition("EXCEEDS", mode, invoked);
      expect(r.proceed && r.cond).toBe("over_budget");
    }
  });

  it("proceeds on its own, with a warning, only where the check is set to warn", () => {
    expect(overBudgetDisposition("EXCEEDS", "advisory", false)).toMatchObject({ proceed: true, autoRouted: true });
  });

  it("under blocking, needs the route invoked", () => {
    expect(overBudgetDisposition("EXCEEDS", "blocking", false)).toMatchObject({ proceed: false, fault: "INSUFFICIENT_FUNDS", controlNotSet: false });
  });

  it("unset, needs the route invoked and says the control is not set", () => {
    expect(overBudgetDisposition("EXCEEDS", null, false)).toMatchObject({ proceed: false, fault: "INVOCATION_REQUIRED", controlNotSet: true });
    expect(overBudgetDisposition("EXCEEDS", null, true)).toMatchObject({ proceed: true, controlNotSet: true, autoRouted: false });
  });

  it("never proceeds with no budget or an ambiguous one", () => {
    expect(overBudgetDisposition("NO_BUDGET", "advisory", true)).toMatchObject({ proceed: false, fault: "NO_BUDGET" });
    expect(overBudgetDisposition("AMBIGUOUS", "advisory", true)).toMatchObject({ proceed: false, fault: "AMBIGUOUS" });
  });

  it("routes a requisition within budget by its band", () => {
    expect(overBudgetDisposition("WITHIN", null, false)).toMatchObject({ proceed: true, cond: null });
  });
});

describe("the day a check was made", () => {
  it("is the organisation's day, not the UTC date", () => {
    // 07:00 on 1 October in Kuala Lumpur is still 30 September in UTC.
    const early = new Date("2026-09-30T23:00:00Z");
    // checkedDay was a bare alias of dayIn and is removed as dead (round 3, item l).
    expect(dayIn(early, "Asia/Kuala_Lumpur")).toBe("2026-10-01");
    expect(isStale(dayIn(early, "Asia/Kuala_Lumpur"), 14, "2026-10-15")).toBe(false);
    expect(isStale("2026-09-30", 14, "2026-10-15")).toBe(true);
  });
});

describe("approval re-checks the ledger before committing (ruling Q2)", () => {
  // Two requisitions of RM40,000 against RM50,000 available: the first approval
  // commits, and the second no longer fits.
  const ledger = [mv("ORIGINAL", "120000.00"), mv("COMMITMENT", "70000.00")];
  const req = { accountCode: "6200200", costCentreUnitCode: "NTH", requested: 4_000_000n };

  it("lets the first approval commit and refuses the second", () => {
    const first = ledgerCheck(code, ledger, req, on);
    expect(approvalBudgetFault(first, null)).toBeNull();
    const afterFirst = [...ledger, mv("COMMITMENT", "40000.00", "2026-09-29")];
    const second = ledgerCheck(code, afterFirst, req, on);
    expect(approvalBudgetFault(second, null)).toBe("EXCEEDS_AT_APPROVAL");
  });

  it("exempts a requisition already on the over-budget route", () => {
    const afterFirst = [...ledger, mv("COMMITMENT", "40000.00", "2026-09-29")];
    expect(approvalBudgetFault(ledgerCheck(code, afterFirst, req, on), "over_budget")).toBeNull();
  });
});

describe("whether approval writes a commitment (ruling BD-13)", () => {
  it("writes only where both the setting and the funding route commit", () => {
    expect(approvalCommitment(true, true)).toBe("WRITE");
  });

  it("writes nothing, and says why, where either is unset or off", () => {
    expect(approvalCommitment(true, null)).toBe("ROUTE_NOT_SET");
    expect(approvalCommitment(true, false)).toBe("ROUTE_OFF");
    expect(approvalCommitment(null, true)).toBe("SETTING_NOT_SET");
    expect(approvalCommitment(false, true)).toBe("SETTING_OFF");
  });
});

describe("a requisition received already approved (ruling BD-10)", () => {
  it("posts its commitment where the portal ledger is the source", () => {
    expect(intakeCommitment("PORTAL_LEDGER", true, true)).toBe("POST");
  });

  it("is refused where the commitment cannot be posted", () => {
    expect(intakeCommitment("PORTAL_LEDGER", true, false)).toBe("NO_BUDGET_CODE");
    expect(intakeCommitment("PORTAL_LEDGER", null, true)).toBe("ROUTE_NOT_SET");
  });

  it("says the commitment is held in the finance system where that is the source", () => {
    expect(intakeCommitment("MANUAL_ERP_ENTRY", true, true)).toBe("HELD_IN_FINANCE");
    // Changed by the round-3 ruling (item h): an unset source is not the finance
    // system. It was HELD_IN_FINANCE; it is now SOURCE_NOT_SET, and intake refuses.
    expect(intakeCommitment(null, true, true)).toBe("SOURCE_NOT_SET");
  });
});

describe("a hand-entered check's age (ruling on hand-entered staleness)", () => {
  it("counts from the date its figures are as at, not the day they were typed", () => {
    const typedToday = { asAt: d("2026-09-10"), checkedAt: new Date("2026-09-30T02:00:00Z") };
    expect(ageDay(typedToday)).toBe("2026-09-10");
    expect(isStale(ageDay(typedToday), 14, "2026-09-30")).toBe(true);
  });
});

describe("the budget re-check at the final approval, by source and verdict (round 3, item g)", () => {
  it("re-checks only where the portal ledger is the source", () => {
    expect(approvalRechecks("PORTAL_LEDGER")).toBe(true);
    expect(approvalRechecks("MANUAL_ERP_ENTRY")).toBe(false);
    expect(approvalRechecks(null)).toBe(false);
  });
  it("proceeds within budget", () => {
    expect(approvalBudgetOutcome("WITHIN", null)).toBe("OK");
  });
  it("returns to Over budget only on EXCEEDS, and not on the over-budget route", () => {
    expect(approvalBudgetOutcome("EXCEEDS", null)).toBe("RETURN");
    expect(approvalBudgetOutcome("EXCEEDS", "over_budget")).toBe("OK");
  });
  it("refuses NO_BUDGET and AMBIGUOUS on any route, never as a return", () => {
    expect(approvalBudgetOutcome("NO_BUDGET", null)).toBe("NO_BUDGET");
    expect(approvalBudgetOutcome("AMBIGUOUS", null)).toBe("AMBIGUOUS");
    expect(approvalBudgetOutcome("NO_BUDGET", "over_budget")).toBe("NO_BUDGET");
    expect(approvalBudgetOutcome("AMBIGUOUS", "over_budget")).toBe("AMBIGUOUS");
  });
});

describe("a received requisition's commitment, the added cases (round 3, item h)", () => {
  it("refuses intake while the budget check source is unset, whatever the route", () => {
    expect(intakeCommitment(null, false, true)).toBe("SOURCE_NOT_SET");
    expect(intakeCommitment(null, null, false)).toBe("SOURCE_NOT_SET");
  });
  it("names a route that does not commit the organisation's budget apart from one held in finance", () => {
    expect(intakeCommitment("PORTAL_LEDGER", false, true)).toBe("ROUTE_OFF");
    expect(intakeCommitment("PORTAL_LEDGER", false, true)).not.toBe("HELD_IN_FINANCE");
  });
});

describe("why a received requisition has no ledger commitment (round 3, item h)", () => {
  it("is held in finance only where the finance system is the source", () => {
    expect(unpostedIntakeReason("MANUAL_ERP_ENTRY", true)).toBe("HELD_IN_FINANCE");
    expect(unpostedIntakeReason(null, true)).toBe("SOURCE_NOT_SET");
  });
  it("names a route that does not commit the organisation's budget", () => {
    expect(unpostedIntakeReason("PORTAL_LEDGER", false)).toBe("ROUTE_OFF");
  });
  it("does not invent a reason the settings do not give", () => {
    expect(unpostedIntakeReason("PORTAL_LEDGER", true)).toBe("UNEXPLAINED");
    expect(unpostedIntakeReason("PORTAL_LEDGER", null)).toBe("UNEXPLAINED");
  });
});
