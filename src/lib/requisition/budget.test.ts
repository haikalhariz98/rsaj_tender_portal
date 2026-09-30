import { describe, expect, it } from "vitest";

import type { BudgetCode, Movement } from "@/lib/budget/codes";

import { checkedDay, identityHolds, isStale, ledgerCheck, manualSnapshot, overBudgetDisposition, snapshotFromLedger, verdictFor } from "./budget";

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
    expect(checkedDay(early, "Asia/Kuala_Lumpur")).toBe("2026-10-01");
    expect(isStale(checkedDay(early, "Asia/Kuala_Lumpur"), 14, "2026-10-15")).toBe(false);
    expect(isStale("2026-09-30", 14, "2026-10-15")).toBe(true);
  });
});
