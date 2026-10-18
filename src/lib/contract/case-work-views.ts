/**
 * The case list's organisation-wide work views (Award and Contract Requirements v2, C-1; AC-17; FR-AWD-006): what the old Awards list
 * counted and listed across every award, as database filters on the Award table so the counts and the pages cover the whole
 * organisation and not one page. Pure. Each fragment is joined to the others by AND, never spread (case-visibility.ts).
 *
 * - `pending`: the appointment is with the approvers.
 * - `approved`: approved, not yet issued.
 * - `return`: issued, and the signed letter not yet accepted (acceptance comes in the same act as the completing return, BD-12).
 * - `commitment`: issued or accepted with no commitment number from the finance system.
 * - `expired`: a work indent not commenced and received before the validity window (`indentExpiryRaised`'s rule). Null when the
 *   organisation has set no validity: the rule exists but nobody has configured it, so the view says so rather than counting zero.
 */

import type { Prisma } from "@/generated/prisma/client";
import { expiredIfReceivedBefore } from "@/lib/award/indent";
import { dayToDate } from "@/lib/dates";
import type { Day } from "@/lib/securities/period";

export const CASE_WORK_VIEWS = ["pending", "approved", "return", "commitment", "expired"] as const;
export type CaseWorkView = (typeof CASE_WORK_VIEWS)[number];

export function caseWorkWhere(indentValidityDays: number | null, today: Day | null): Record<CaseWorkView, Prisma.AwardWhereInput | null> {
  const before = today ? expiredIfReceivedBefore(indentValidityDays, today) : null;
  return {
    pending: { status: "PENDING_APPROVAL" },
    approved: { status: "APPROVED" },
    return: { status: "ISSUED" },
    commitment: { status: { in: ["ISSUED", "ACCEPTED"] }, erpCommitmentNo: null },
    expired: before ? { instrumentKind: "WORK_INDENT", status: { not: "CANCELLED" }, commencedOn: null, indentReceivedOn: { lt: dayToDate(before) } } : null,
  };
}
