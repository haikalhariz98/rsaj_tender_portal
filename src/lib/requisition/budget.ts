/**
 * The requisition budget check (FR-REQ-007, FR-REQ-008, ADR 0004).
 *
 * Pure, in sen. The check reads the movement ledger through a budget code; each
 * check is a snapshot of the four request-form figures, stored append-only. The
 * verdict is computed from the balance and the amount alone: "Approved Account" is
 * committed plus spent, ASSUMED until the customer's finance confirms what the form
 * means by it, and the verdict never reads it. Figures typed from the finance system
 * are stored exactly as typed.
 */

import { inForceOn } from "@/lib/effective";
import { figuresFor, type BudgetCode, type Movement } from "@/lib/budget/codes";
import { addSen, compareSen, subtractSen, type Sen } from "@/lib/money";

import { daysFrom } from "@/lib/dates";
import type { BudgetCheckSource, BudgetVerdict, Provenance } from "./types";

export interface BudgetSnapshot {
  source: BudgetCheckSource;
  actualBudget: Sen | null;
  balanceAsAt: Sen | null;
  approvedAccount: Sen | null;
  approvedAccountProvenance: Provenance;
  projectedBalance: Sen | null;
  requested: Sen;
  verdict: BudgetVerdict;
  /// Warnings beside the verdict, as keys.
  warnings: ("COST_CENTRE_OUTSIDE_OWNER" | "IDENTITY_BROKEN")[];
}

/// Exactly exhausting the balance fits; one sen over does not.
export function verdictFor(balance: Sen, requested: Sen): "WITHIN" | "EXCEEDS" {
  return compareSen(requested, balance) <= 0 ? "WITHIN" : "EXCEEDS";
}

/**
 * The four figures from the portal ledger, for one code on one day.
 *
 * Actual budget is what is allocated; the balance is what is available; Approved
 * Account is committed plus spent (ASSUMED); the projected balance is the balance
 * less the amount asked for.
 */
export function snapshotFromLedger(
  figures: { allocated: Sen; committed: Sen; actualSpend: Sen; available: Sen },
  requested: Sen,
): BudgetSnapshot {
  const approvedAccount = addSen(figures.committed, figures.actualSpend);
  return {
    source: "PORTAL_LEDGER",
    actualBudget: figures.allocated,
    balanceAsAt: figures.available,
    approvedAccount,
    approvedAccountProvenance: "ASSUMED",
    projectedBalance: subtractSen(figures.available, requested),
    requested,
    verdict: verdictFor(figures.available, requested),
    warnings: [],
  };
}

/**
 * Actual budget less Approved Account equals the balance — checked on portal-ledger
 * snapshots only. A hand-entered finance-system figure is the finance system's, and
 * is never "corrected" to make the arithmetic close.
 */
export function identityHolds(s: BudgetSnapshot): boolean | null {
  if (s.source !== "PORTAL_LEDGER") return null;
  if (s.actualBudget == null || s.approvedAccount == null || s.balanceAsAt == null) return null;
  return subtractSen(s.actualBudget, s.approvedAccount) === s.balanceAsAt;
}

/**
 * The portal-ledger check for a requisition.
 *
 * NO_BUDGET where there is no code, the code is withdrawn or out of its dates, or it
 * holds no allocation. AMBIGUOUS where the requisition's account is not the code's:
 * there is then no telling which line the money is checked against. A cost centre
 * outside the code's owning unit warns and does not block (ADR 0004).
 */
export function ledgerCheck(
  code: BudgetCode | null,
  movements: readonly Movement[],
  req: { accountCode: string; costCentreUnitCode: string | null; requested: Sen },
  on: Date,
): BudgetSnapshot {
  const empty = (verdict: BudgetVerdict): BudgetSnapshot => ({
    source: "PORTAL_LEDGER",
    actualBudget: null,
    balanceAsAt: null,
    approvedAccount: null,
    approvedAccountProvenance: "ASSUMED",
    projectedBalance: null,
    requested: req.requested,
    verdict,
    warnings: [],
  });
  if (!code || !code.isActive || !inForceOn(code, on)) return empty("NO_BUDGET");
  if (code.accountCode !== req.accountCode) return empty("AMBIGUOUS");
  const figures = figuresFor(movements, code.id, on);
  if (figures.allocated <= 0n) return empty("NO_BUDGET");
  const snapshot = snapshotFromLedger(figures, req.requested);
  if (code.owningUnitCode && req.costCentreUnitCode && code.owningUnitCode !== req.costCentreUnitCode) {
    snapshot.warnings.push("COST_CENTRE_OUTSIDE_OWNER");
  }
  return snapshot;
}

/**
 * A check typed in from the finance system. Stored as typed; the verdict still comes
 * from the balance and the amount alone. Approved Account is OBSERVED: read off the
 * finance system, its meaning not yet confirmed (a build decision in the plan).
 */
export function manualSnapshot(
  typed: { actualBudget: Sen | null; balanceAsAt: Sen; approvedAccount: Sen | null; projectedBalance: Sen | null },
  requested: Sen,
): BudgetSnapshot {
  return {
    source: "MANUAL_ERP_ENTRY",
    actualBudget: typed.actualBudget,
    balanceAsAt: typed.balanceAsAt,
    approvedAccount: typed.approvedAccount,
    approvedAccountProvenance: "OBSERVED",
    projectedBalance: typed.projectedBalance,
    requested,
    verdict: verdictFor(typed.balanceAsAt, requested),
    warnings: [],
  };
}

/**
 * Whether a check is too old to submit on. `days` null: nobody has set a re-check
 * window, so a check never goes stale — and the screen says that is why.
 */
export function isStale(checkedOn: string, days: number | null, today: string): boolean {
  if (days == null) return false;
  return daysFrom(checkedOn, today) > days;
}

export type Disposition =
  | { proceed: true; cond: "over_budget" | null; controlNotSet: boolean; autoRouted: boolean }
  | { proceed: false; fault: "NO_BUDGET" | "AMBIGUOUS" | "INSUFFICIENT_FUNDS" | "INVOCATION_REQUIRED"; controlNotSet: boolean };

/**
 * What an over-budget requisition does (FR-REQ-008, ruling OD-6).
 *
 * Every EXCEEDS requisition that proceeds routes on the over-budget condition, never
 * by band. It proceeds on its own, with a warning, only where the availability check
 * is set to warn (the setting's value is `advisory`). Blocking, it proceeds only when
 * the officer invokes the over-budget route. Unset, it also needs invoking, and says
 * the control is not set. No budget, or an ambiguous one, never proceeds.
 */
export function overBudgetDisposition(
  verdict: BudgetVerdict,
  availabilityCheck: string | null | undefined,
  invoked: boolean,
): Disposition {
  if (verdict === "NO_BUDGET" || verdict === "AMBIGUOUS") {
    return { proceed: false, fault: verdict, controlNotSet: false };
  }
  if (verdict === "WITHIN") return { proceed: true, cond: null, controlNotSet: false, autoRouted: false };

  if (availabilityCheck === "advisory") return { proceed: true, cond: "over_budget", controlNotSet: false, autoRouted: true };
  const controlNotSet = availabilityCheck !== "blocking";
  if (!invoked) {
    return { proceed: false, fault: controlNotSet ? "INVOCATION_REQUIRED" : "INSUFFICIENT_FUNDS", controlNotSet };
  }
  return { proceed: true, cond: "over_budget", controlNotSet, autoRouted: false };
}

/**
 * Whether the final approval re-checks the budget (code re-review, round 3): only
 * where the portal ledger is the budget check's source. A check typed from the finance
 * system cannot be re-run under a lock here, and an unset source runs no check.
 */
export function approvalRechecks(source: BudgetCheckSource | null): boolean {
  return source === "PORTAL_LEDGER";
}

export type ApprovalBudgetOutcome = "OK" | "RETURN" | "NO_BUDGET" | "AMBIGUOUS";

/**
 * What the re-check at approval does, by its verdict. Only EXCEEDS returns the
 * requisition to Over budget (ruling Q2), and not on the over-budget route, which was
 * approved to exceed. NO_BUDGET and AMBIGUOUS are not "over budget": the approval is
 * refused and nothing is written, on any route.
 */
export function approvalBudgetOutcome(verdict: BudgetVerdict, cond: string | null): ApprovalBudgetOutcome {
  if (verdict === "NO_BUDGET") return "NO_BUDGET";
  if (verdict === "AMBIGUOUS") return "AMBIGUOUS";
  if (verdict === "EXCEEDS") return cond === "over_budget" ? "OK" : "RETURN";
  return "OK";
}

export type ApprovalCommitment = "WRITE" | "SETTING_OFF" | "SETTING_NOT_SET" | "ROUTE_OFF" | "ROUTE_NOT_SET";

/**
 * Whether approval writes a commitment (ADR 0004, ruling BD-13): only where the budget
 * settings commit on approval and the funding route commits the organisation's own
 * budget. Either unset writes nothing, and says which.
 */
export function approvalCommitment(commitOnApproval: boolean | null, routeCommitsBudget: boolean | null): ApprovalCommitment {
  if (commitOnApproval == null) return "SETTING_NOT_SET";
  if (!commitOnApproval) return "SETTING_OFF";
  if (routeCommitsBudget == null) return "ROUTE_NOT_SET";
  return routeCommitsBudget ? "WRITE" : "ROUTE_OFF";
}

export type IntakeCommitment = "POST" | "ROUTE_OFF" | "HELD_IN_FINANCE" | "SOURCE_NOT_SET" | "ROUTE_NOT_SET" | "NO_BUDGET_CODE";

/**
 * A requisition received already approved (ruling BD-10). Where the portal ledger is
 * the budget check's source, a commitment the ledger does not hold overstates what is
 * available, so it is posted — or the intake is refused where it cannot be. Where the
 * finance system is the source, the commitment is held there and the screen says so.
 */
export function intakeCommitment(
  source: BudgetCheckSource | null,
  routeCommitsBudget: boolean | null,
  hasBudgetCode: boolean,
): IntakeCommitment {
  // Unset is not "the finance system": nobody has said where the budget is held, so
  // intake is refused until the source is set (round 3, item h).
  if (source == null) return "SOURCE_NOT_SET";
  if (source !== "PORTAL_LEDGER") return "HELD_IN_FINANCE";
  if (routeCommitsBudget == null) return "ROUTE_NOT_SET";
  if (!routeCommitsBudget) return "ROUTE_OFF";
  return hasBudgetCode ? "POST" : "NO_BUDGET_CODE";
}

export type UnpostedReason = "HELD_IN_FINANCE" | "ROUTE_OFF" | "SOURCE_NOT_SET" | "UNEXPLAINED";

/**
 * Why a received requisition has no commitment in the portal ledger, read from the
 * settings in force (round 3, item h). Only the finance system as the source means
 * "held in the finance system"; a route that does not commit the organisation's budget
 * says so; an unset source is not the finance system.
 */
export function unpostedIntakeReason(source: BudgetCheckSource | null, routeCommitsBudget: boolean | null): UnpostedReason {
  if (source == null) return "SOURCE_NOT_SET";
  if (source === "MANUAL_ERP_ENTRY") return "HELD_IN_FINANCE";
  if (routeCommitsBudget === false) return "ROUTE_OFF";
  return "UNEXPLAINED";
}
