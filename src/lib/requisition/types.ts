/**
 * The requisition's vocabulary, as pure types.
 *
 * Mirrors the Prisma enums so `src/lib/requisition/**` stays free of the client, as
 * the other lib modules do. Every rule about a requisition lives beside this file;
 * actions and screens call it and never restate it.
 */

import type { OrgUnitKind } from "@/lib/organisation/types";

export type { OrgUnitKind };

export type RequisitionStatus =
  | "DRAFT"
  | "ENDORSED"
  | "RETURNED"
  | "REGISTERED"
  | "BUDGET_CHECKED"
  | "OVER_BUDGET"
  | "PENDING_APPROVAL"
  | "REJECTED"
  | "RECALLED"
  | "APPROVED"
  | "SOURCING"
  | "PARTIALLY_FULFILLED"
  | "FULFILLED"
  | "CANCELLED"
  | "CLOSED";

export type RequisitionOrigin = "PORTAL" | "EXTERNAL";
export type BudgetCheckSource = "PORTAL_LEDGER" | "MANUAL_ERP_ENTRY";
export type BudgetVerdict = "WITHIN" | "EXCEEDS" | "NO_BUDGET" | "AMBIGUOUS";
export type SplitState = "CLEAR" | "FLAGGED" | "NOT_SET";
export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "RECALLED";
export type StepDecision = "PENDING" | "DONE" | "REJECTED";
export type Provenance = "STATED" | "OBSERVED" | "ASSUMED";

/// The requisition domain and the over-budget condition: vocabulary the engine
/// routes on, not policy. Which rows exist for them is the customer's configuration.
export const REQUISITION_DOMAIN = "requisition";
export const OVER_BUDGET_COND = "over_budget";

/// The keys two requisitions can be compared on for splitting (FR-REQ-015).
export const SPLIT_KEYS = ["unit", "costCentre", "accountCode", "budgetCode", "contractType"] as const;
export type SplitKey = (typeof SPLIT_KEYS)[number];

/// RequisitionPolicy, every field nullable: unset is not zero.
export interface RequisitionPolicy {
  splittingWindowDays: number | null;
  splittingMatchOn: SplitKey[];
  splittingAggregateAcrossYear: boolean | null;
  budgetRecheckDays: number | null;
  endorsementTiers: OrgUnitKind[];
  /// The office whose holder may justify a flagged split. Null blocks justification.
  splitJustifyingRoleCode: string | null;
  provenance: Provenance | null;
}

export const UNSET_POLICY: RequisitionPolicy = {
  splittingWindowDays: null,
  splittingMatchOn: [],
  splittingAggregateAcrossYear: null,
  budgetRecheckDays: null,
  endorsementTiers: [],
  splitJustifyingRoleCode: null,
  provenance: null,
};
