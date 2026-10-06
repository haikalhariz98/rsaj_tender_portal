import type { RequisitionStatus } from "./types";

/**
 * A requisition past Draft without a budget code (founder, 2026-10-05: the code is required).
 * Only one endorsed before the rule can be in this state, and its fields are fixed until it is
 * returned as incomplete, so "Budget code is required" would ask for something nobody can do here.
 * This says what can be done instead: return it, reopen it as a draft and add the code (since
 * 2026-10-06 that is possible after the budget check too). Null when the code is there, or the
 * requisition is still a draft (the field rule speaks there) or past submission.
 */
export type MissingBudgetCode = "RETURN_TO_ADD" | "RAISE_AGAIN";

const PAST_ENDORSEMENT: readonly RequisitionStatus[] = ["REGISTERED", "BUDGET_CHECKED", "OVER_BUDGET"];

export function missingBudgetCode(status: RequisitionStatus, budgetCodeId: string | null): MissingBudgetCode | null {
  if (budgetCodeId != null && budgetCodeId.trim() !== "") return null;
  if (status === "ENDORSED") return "RETURN_TO_ADD";
  if (PAST_ENDORSEMENT.includes(status)) return "RAISE_AGAIN";
  return null;
}

export const MISSING_BUDGET_CODE_TEXT: Readonly<Record<MissingBudgetCode, string>> = {
  RETURN_TO_ADD: "It has no budget code: it was endorsed before one was required. Return it to draft, add the budget code, and have it endorsed again.",
  // Founder, 2026-10-06: a checked requisition can be returned too, so the way out is the same.
  RAISE_AGAIN: "It has no budget code: it went past endorsement before one was required. Return it as incomplete, reopen it as a draft and add the budget code.",
};
