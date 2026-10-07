import type { AuthorityMatrix } from "@/generated/prisma/client";

/**
 * What a new revision of an issue carries (review of Phase 2c). A revision is a draft copy of an issue: the policy columns travel, and everything that records
 * the life of the issue it was copied from starts again. The columns are listed one by one, and the list is typed as every column of the row, so that a column
 * added to the model is a compile error here until someone decides whether a revision carries it. Spreading the source row instead copied the issuer
 * of the issue onto the draft the day Phase 2c added it, and the database (`AuthorityMatrix_issuer_needs_issue`) refused the draft.
 */
const COLUMNS = {
  id: "fresh",
  organisationId: "carry",
  label: "fresh",
  effectiveFrom: "fresh",
  effectiveTo: "fresh",
  issuedAt: "fresh",
  boundaryValue: "carry",
  boundaryInclusive: "carry",
  quotationFloor: "carry",
  tenderFloor: "carry",
  requisitionBoundary: "carry",
  splittingWindowDays: "carry",
  currency: "carry",
  noRuleClause: "carry",
  selfApprovalClause: "carry",
  absenceClause: "carry",
  funderOverrideClause: "carry",
  fundingRouteCode: "carry",
  boundaryProvenance: "carry",
  boundarySource: "carry",
  // Who issued the source says nothing of this draft: it has no issuer until a second person issues it.
  issuedByPersonId: "fresh",
  // The flag records a draft that existed when sign-in landed. A draft started now was made by the person who started it.
  makersUnknownAtLanding: "fresh",
} as const satisfies Record<keyof AuthorityMatrix, "carry" | "fresh">;

type Carried = { [K in keyof AuthorityMatrix as (typeof COLUMNS)[K] extends "carry" ? K : never]: AuthorityMatrix[K] };

/// The row of the new draft: the source's policy, and a label and a start day of its own. Never issued, never with an issuer, and not a landing draft.
export function draftFromIssue(source: AuthorityMatrix, own: { label: string; effectiveFrom: Date }) {
  const carried = Object.fromEntries((Object.keys(COLUMNS) as (keyof AuthorityMatrix)[]).filter((k) => (COLUMNS[k] as string) === "carry").map((k) => [k, source[k]])) as Carried;
  return {
    ...carried,
    label: own.label,
    effectiveFrom: own.effectiveFrom,
    effectiveTo: null,
    issuedAt: null,
    issuedByPersonId: null,
    makersUnknownAtLanding: false,
  };
}

/// The columns a revision starts again rather than copies, for a test that pins them against the model.
export const REVISION_FRESH_COLUMNS = (Object.keys(COLUMNS) as (keyof AuthorityMatrix)[]).filter((k) => (COLUMNS[k] as string) === "fresh");
