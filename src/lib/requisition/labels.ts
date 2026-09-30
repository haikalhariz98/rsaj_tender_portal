/**
 * How the requisition's codes and faults read. Codes never reach a screen: every
 * status, verdict, fault and key is rendered through here.
 */

import type { FieldFault } from "./fields";
import type { EndorsementFault } from "./endorsement";
import type { FundingFault } from "./funding";
import type { DeciderFault } from "./holders";
import type { TransitionFault } from "./status";
import type { BudgetVerdict, OrgUnitKind, RequisitionStatus, SplitKey } from "./types";

type Tone = "neutral" | "brand" | "ok" | "warn" | "err" | "info";

export const STATUS_LABEL: Record<RequisitionStatus, string> = {
  DRAFT: "Draft",
  ENDORSED: "Endorsed",
  RETURNED: "Returned",
  REGISTERED: "Registered",
  BUDGET_CHECKED: "Budget checked",
  OVER_BUDGET: "Over budget",
  PENDING_APPROVAL: "Pending approval",
  REJECTED: "Rejected",
  RECALLED: "Recalled",
  APPROVED: "Approved",
  SOURCING: "Sourcing in progress",
  PARTIALLY_FULFILLED: "Partially fulfilled",
  FULFILLED: "Fulfilled",
  CANCELLED: "Cancelled",
  CLOSED: "Closed",
};

/// The lifecycle, in the order a requisition moves through it (§7.3.1), for filters.
export const STATUS_ORDER: readonly RequisitionStatus[] = [
  "DRAFT",
  "RETURNED",
  "ENDORSED",
  "REGISTERED",
  "BUDGET_CHECKED",
  "OVER_BUDGET",
  "PENDING_APPROVAL",
  "RECALLED",
  "REJECTED",
  "APPROVED",
  "SOURCING",
  "PARTIALLY_FULFILLED",
  "FULFILLED",
  "CANCELLED",
  "CLOSED",
];

export const STATUS_TONE: Record<RequisitionStatus, Tone> = {
  DRAFT: "neutral",
  ENDORSED: "info",
  RETURNED: "warn",
  REGISTERED: "info",
  BUDGET_CHECKED: "info",
  OVER_BUDGET: "warn",
  PENDING_APPROVAL: "brand",
  REJECTED: "err",
  RECALLED: "warn",
  APPROVED: "ok",
  SOURCING: "ok",
  PARTIALLY_FULFILLED: "ok",
  FULFILLED: "ok",
  CANCELLED: "neutral",
  CLOSED: "neutral",
};

export const VERDICT_LABEL: Record<BudgetVerdict, string> = {
  WITHIN: "Within budget",
  EXCEEDS: "Over budget",
  NO_BUDGET: "No budget",
  AMBIGUOUS: "Budget unclear",
};

export const VERDICT_TONE: Record<BudgetVerdict, Tone> = {
  WITHIN: "ok",
  EXCEEDS: "err",
  NO_BUDGET: "err",
  AMBIGUOUS: "warn",
};

export const SOURCE_LABEL = {
  PORTAL_LEDGER: "The portal's budget ledger",
  MANUAL_ERP_ENTRY: "Entered by hand from the finance system",
} as const;

export const TIER_LABEL: Record<OrgUnitKind, string> = {
  COMPANY: "Company",
  DIVISION: "Head of Division",
  DEPARTMENT: "Head of Department",
  SECTION: "Section Head",
};

export const SPLIT_KEY_LABEL: Record<SplitKey, string> = {
  unit: "Requesting department",
  costCentre: "Cost centre",
  accountCode: "Account code",
  budgetCode: "Budget code",
  contractType: "Contract type",
};

export const DECISION_LABEL = { PENDING: "Pending", DONE: "Done", REJECTED: "Rejected" } as const;
export const APPROVAL_STATUS_LABEL = { PENDING: "In progress", APPROVED: "Approved", REJECTED: "Rejected", RECALLED: "Recalled" } as const;

/// The warning a route carries when its final approval was returned for budget (BD-24).
export const RETURNED_AT_APPROVAL = "RETURNED_AT_APPROVAL";
export const RETURNED_AT_APPROVAL_LABEL = "Returned at approval (budget)";

/// Whether a route's stored warnings say it was closed by a budget return at approval.
export function returnedAtApproval(warnings: unknown): boolean {
  return Array.isArray(warnings) && warnings.some((w) => (w as { code?: unknown } | null)?.code === RETURNED_AT_APPROVAL);
}

/**
 * The same, for a route's status as the audit trail recorded it: the trail entry of a
 * budget return carries `returnedAtApproval`, so the History tab reads it as the
 * record does. Only an entry that recorded the route closing RECALLED is affected.
 */
export function trailRouteStatusLabel(value: string, changes: readonly { field: string; after: string | null }[]): string {
  const returned = value === "RECALLED" && changes.some((c) => c.field === "returnedAtApproval" && c.after != null && c.after !== "" && c.after !== "no" && c.after !== "false");
  return returned ? RETURNED_AT_APPROVAL_LABEL : (APPROVAL_STATUS_LABEL[value as keyof typeof APPROVAL_STATUS_LABEL] ?? "Not recorded");
}

/**
 * How an approval route's status reads wherever it is listed. A route closed by a
 * budget return is stored RECALLED, but nobody recalled it: it reads "Returned at
 * approval (budget)", never a bare "Recalled".
 */
export function approvalRouteLabel(status: keyof typeof APPROVAL_STATUS_LABEL | string, warnings: unknown): string {
  if (status === "RECALLED" && returnedAtApproval(warnings)) return RETURNED_AT_APPROVAL_LABEL;
  return APPROVAL_STATUS_LABEL[status as keyof typeof APPROVAL_STATUS_LABEL] ?? "Not recorded";
}
export const OPERATOR_LABEL = {
  GT: "Above the boundary — a value exactly on it stays in the lower band",
  GTE: "At or above the boundary — a value exactly on it moves to the upper band",
} as const;

const FIELD_NAME: Record<string, string> = {
  title: "Title",
  justification: "Justification",
  needStatement: "Need statement",
  requestingUnitCode: "Requesting department",
  sectionUnitCode: "Section",
  requestingPersonId: "Requesting officer",
  costCentreCode: "Cost centre",
  accountCode: "Account code",
  budgetCodeId: "Budget code",
  siteCode: "Site",
  placeOfDelivery: "Place of delivery",
  dateRequired: "Date required",
  estimatedValue: "Estimated value",
  fundingRouteCode: "Funding route",
  contractTypeCode: "Contract type",
  lines: "Line items",
  erpRequisitionNo: "Finance system requisition no.",
  erpNoteNo: "Requisition note no.",
  // Recorded on the trail rather than typed on the form.
  fundingSupersedesAuthority: "Funder's rules supersede the approval matrix",
  sourcingPermitted: "Sourcing permitted",
  fundingPosture: "What the funding route means",
  externalAuthorityRef: "External authority",
  splitState: "Splitting check",
  returnedReason: "Reason for the return",
  returnedToPersonId: "Returned to",
  returnedOn: "Returned on",
  cancelReason: "Reason for cancelling",
  raisedOn: "Raised on",
};

/// A requisition field's own name where it has one, for the trail.
export function knownFieldName(field: string): string | null {
  return FIELD_NAME[field] ?? FIELD_NAME[field.replace(/Id$/, "Id").replace(/Code$/, "Code")] ?? null;
}

export const POSTURE_LABEL: Record<string, string> = {
  PROCURES: "The organisation procures",
  ROUTE_SET_EXTERNALLY: "An external body sets the route",
  RECORDS_ONLY: "Records only: the organisation does not procure",
};

export function fieldName(field: string): string {
  const line = /^lines\.(\d+)\./.exec(field);
  if (line) return `Line ${Number(line[1]) + 1}`;
  return FIELD_NAME[field] ?? "A field";
}

const rm = (sen: bigint) => {
  const neg = sen < 0n;
  const abs = neg ? -sen : sen;
  const whole = (abs / 100n).toLocaleString("en-MY");
  const cents = abs % 100n;
  // As formatRM writes it: "RM9,500", with sen only where there are some.
  return `${neg ? "−" : ""}RM${whole}${cents ? `.${cents.toString().padStart(2, "0")}` : ""}`;
};

export function fieldFaultText(f: FieldFault): string {
  switch (f.code) {
    case "REQUIRED":
      return `${fieldName(f.field)} is required.`;
    case "NO_LINES":
      return "Add at least one line item.";
    case "LINE_DESCRIPTION_REQUIRED":
      return `Line ${f.lineNo} needs a description.`;
    case "LINE_AMOUNT_REQUIRED":
      return `Line ${f.lineNo} needs an amount.`;
    case "LINES_DO_NOT_SUM":
      return `The lines come to ${rm(f.total)}, not the estimated value of ${rm(f.value)}.`;
    case "NOT_IN_FORCE":
      return `${fieldName(f.field)} is not in force today.`;
    case "NOT_A_DEPARTMENT":
      return "Choose a department as the requesting unit.";
    case "SECTION_NOT_UNDER_UNIT":
      return "That section is not in the requesting department.";
    case "INACTIVE_PERSON":
      return "That officer is recorded as having left.";
    case "ACCOUNT_NOT_BUDGET_CODE_ACCOUNT":
      return "The account code is not the budget code's own account.";
    case "MALFORMED":
      return `${fieldName(f.field)} does not match its format${f.example ? ` (for example ${f.example})` : ""}.`;
    case "BAD_PATTERN":
      return `The format configured for ${fieldName(f.field).toLowerCase()} cannot be read. Correct it under Organisation, Code formats.`;
    case "NO_FORMAT":
      return `No format is configured for ${fieldName(f.field).toLowerCase()}, so it is not checked.`;
  }
}

export function endorsementFaultText(f: EndorsementFault, names: (id: string) => string = () => "That person"): string {
  switch (f.code) {
    case "NOT_SET":
      return "No endorsement tiers are set, so nothing can be endorsed or submitted. Set them in Requisition controls.";
    case "TIER_NOT_ON_PATH":
      return `The policy asks for a ${TIER_LABEL[f.tier]}'s endorsement, but the requesting unit has no ${f.tier.toLowerCase()} above it.`;
    case "NO_HEAD":
      return `The ${f.tier.toLowerCase()} on this requisition's path has no head recorded. Record one under Organisation.`;
    case "MISSING":
      return `Awaiting the ${TIER_LABEL[f.tier]}'s endorsement.`;
    case "NOT_HEAD":
      return `${names(f.personId)} did not head that unit on the endorsement date.`;
    case "FUTURE_DATE":
      return "An endorsement cannot be dated after today.";
    case "TIME_ZONE_UNSET":
      return "Set the organisation's time zone before recording endorsements.";
    case "REQUESTER":
      return "The requesting officer cannot endorse their own requisition.";
    case "BEFORE_RAISED":
      return "An endorsement cannot be dated before the day the requisition was raised.";
  }
}

export function fundingFaultText(f: FundingFault): string {
  switch (f.code) {
    case "FUNDING_REQUIRED":
      return "Choose a funding route. It is required to submit.";
    case "ROUTE_RETIRED":
      return `The funding route ${f.route} is retired.`;
    case "EXTERNAL_REF_MISSING":
      return `${f.label} must be recorded before this requisition can progress.`;
  }
}

export function transitionFaultText(f: TransitionFault): string {
  switch (f.code) {
    case "NOT_ALLOWED":
      return `A ${STATUS_LABEL[f.from].toLowerCase()} requisition cannot become ${STATUS_LABEL[f.to].toLowerCase()}.`;
    case "TIME_ZONE_UNSET":
      return "Set the organisation's time zone first: this act depends on today's date, and it is not assumed to be UTC.";
    case "FIELDS_INCOMPLETE":
      return `${f.count} ${f.count === 1 ? "field needs" : "fields need"} attention before it can leave draft.`;
    case "ENDORSEMENTS_INCOMPLETE":
      return `${f.count} ${f.count === 1 ? "endorsement is" : "endorsements are"} outstanding.`;
    case "ENDORSEMENT_TIERS_NOT_SET":
      return "No endorsement tiers are set in Requisition controls, so it cannot be endorsed.";
    case "ERP_POLICY_NOT_SET":
      return "Whether registration needs the finance system's numbers is not set in Requisition controls.";
    case "ERP_REFS_REQUIRED":
      return `Record the ${f.missing.map((m) => fieldName(m).toLowerCase()).join(" and ")} first.`;
    case "RETURN_DETAILS_REQUIRED":
      return `A return needs its ${f.missing.join(", ")}.`;
    case "REASON_REQUIRED":
      return "A reason is required.";
    case "FUTURE_DATE":
      return "The date cannot be after today.";
    case "STEP_ALREADY_DECIDED":
      return "A step has already been decided, so it can no longer be recalled.";
  }
}

/// A decider refusal naming the person chosen rather than "that person".
export function deciderFaultText(f: DeciderFault, name: string | null): string {
  const text = DECIDER_FAULT_TEXT[f];
  if (!name) return text;
  return text.replace(/^That person/, name).replace(/that person/g, name);
}

export const DECIDER_FAULT_TEXT: Record<DeciderFault, string> = {
  TIME_ZONE_UNSET: "Set the organisation's time zone before recording decisions.",
  COMMITTEE_STEP: "A committee step is decided by the committee: cite its decision from the sitting.",
  NOT_PENDING: "This step is already decided.",
  OUT_OF_ORDER: "An earlier step is still pending. Steps are decided in order.",
  INACTIVE: "That person is recorded as having left.",
  NOT_HOLDER: "That person does not hold this office for the requesting unit on that date, and holds no delegation of it.",
  DELEGATION_NOT_PERMITTED: "This step cannot be delegated, and that person acts only under a delegation.",
  OVER_CEILING: "The requisition's value is above the ceiling of the delegation that person acts under.",
  SELF_APPROVAL: "That person raised this requisition. Nobody decides their own.",
  ENDORSED_IT:
    "That person endorsed this requisition. An endorser may decide only a step of the office they hold directly for the unit they endorsed for — never as a delegate, and never another office's step.",
  ALREADY_DISCHARGED_A_STEP: "That person has already decided another step of this route.",
  FUTURE_DATE: "A decision cannot be dated after today.",
  BEFORE_SUBMISSION: "A decision cannot be dated before the requisition was submitted.",
};

/// Why a received requisition's commitment is not in the portal ledger, as a title.
export const UNPOSTED_TITLE: Record<"HELD_IN_FINANCE" | "ROUTE_OFF" | "SOURCE_NOT_SET" | "UNEXPLAINED", string> = {
  HELD_IN_FINANCE: "Commitment held in the finance system, not posted in the portal ledger",
  ROUTE_OFF: "This funding route does not commit the organisation's budget",
  SOURCE_NOT_SET: "No commitment posted: where the budget check comes from is not set",
  UNEXPLAINED: "No commitment posted in the portal ledger",
};

export const UNPOSTED_TEXT: Record<keyof typeof UNPOSTED_TITLE, string> = {
  HELD_IN_FINANCE: "It was approved in the finance system, which holds its commitment. The portal's budget figures do not include it.",
  ROUTE_OFF: "Approval on its funding route does not commit the organisation's own budget, so no commitment was posted for it.",
  SOURCE_NOT_SET: "Nobody has said whether the budget is held in the portal ledger or the finance system, so the portal's figures may not include it. Set the source in Requisition controls.",
  UNEXPLAINED: "The settings in force would post one, and none is on the ledger: it may have been received before they were set. The portal's figures do not include it.",
};

/**
 * What an undecided step says. On an open route it awaits a decision; on a closed
 * route it never will, and says why the route closed — never "awaiting".
 */
export function undecidedStepText(route: { status: string; warnings: unknown }, committee: boolean): string {
  if (route.status === "PENDING") return committee ? "Awaiting the committee's decision on a tabled matter." : "Awaiting a decision.";
  if (route.status === "RECALLED") return returnedAtApproval(route.warnings) ? "Not decided — route returned at approval" : "Not decided — route recalled";
  if (route.status === "REJECTED") return "Not decided — route rejected at an earlier step";
  if (route.status === "APPROVED") return "Not decided — route closed as approved";
  return "Not decided — route closed";
}
