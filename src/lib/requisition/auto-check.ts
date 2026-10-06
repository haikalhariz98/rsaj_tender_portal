import { missingBudgetCode, type MissingBudgetCode } from "./budget-code";
import type { RequisitionStatus } from "./types";

/**
 * When the budget is checked without being asked (founder, 2026-10-06): once a requisition
 * is marked endorsed, and again when its funding changes, the check runs by itself where
 * it needs nothing typed. Where the figures come from the finance system someone has to
 * type them, so that source (and an unset one) is left to the Check budget button.
 *
 * `budgetCheckRefusal` is the one set of rules for "can a check run on this requisition
 * today", read by the Check budget action and by the automatic path alike; `autoCheck`
 * adds the one thing only the automatic path asks, that the source needs no typing.
 */

/// Statuses a budget check may be run in: after endorsement, before submission.
export const CHECKABLE: readonly RequisitionStatus[] = ["ENDORSED", "REGISTERED", "BUDGET_CHECKED", "OVER_BUDGET"];

export type BudgetCheckSource = "PORTAL_LEDGER" | "MANUAL_ERP_ENTRY";

export type BudgetCheckRefusal = { code: "NOT_CHECKABLE" } | { code: "NO_BUDGET_CODE"; missing: MissingBudgetCode } | { code: "TIME_ZONE_UNSET" };

/// Why no check can run on a requisition in this status, or null. Status first, then the
/// budget code, then the time zone: the order the Check budget action has always refused in.
export function budgetCheckRefusal(status: RequisitionStatus, budgetCodeId: string | null, today: string | null): BudgetCheckRefusal | null {
  if (!CHECKABLE.includes(status)) return { code: "NOT_CHECKABLE" };
  const missing = missingBudgetCode(status, budgetCodeId);
  if (missing) return { code: "NO_BUDGET_CODE", missing };
  if (!today) return { code: "TIME_ZONE_UNSET" };
  return null;
}

export type AutoCheck = { run: true } | { run: false; reason: BudgetCheckRefusal | { code: "SOURCE_NOT_SET" } | { code: "TYPED_FIGURES_NEEDED" } };

/// Whether the budget is checked automatically now. Only the portal ledger is: it needs nothing typed.
export function autoCheck(source: BudgetCheckSource | null, status: RequisitionStatus, budgetCodeId: string | null, today: string | null): AutoCheck {
  const refusal = budgetCheckRefusal(status, budgetCodeId, today);
  if (refusal) return { run: false, reason: refusal };
  if (!source) return { run: false, reason: { code: "SOURCE_NOT_SET" } };
  if (source === "MANUAL_ERP_ENTRY") return { run: false, reason: { code: "TYPED_FIGURES_NEEDED" } };
  return { run: true };
}
