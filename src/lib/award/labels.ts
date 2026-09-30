/**
 * The award's words: every label and fault text the screens and actions show. Codes
 * are configuration keys and never reach a screen (AGENTS rule 5); where a fault has a
 * place it is put right, `FIX_AT` says where.
 */

import { findingText as methodFindingText, REGIME_SHORT } from "@/lib/method/labels";
import type { Regime } from "@/lib/method/types";

import { mergeFieldLabel } from "./fields";
import type { AwardStatus, DeliveryMethod, DocumentKind, DocumentLanguage, Finding, InstrumentKind, NonCommencement, PeriodUnit, QuotationContractKey } from "./types";

export const AWARD_STATUS_LABEL: Record<AwardStatus, string> = {
  DRAFT: "Draft",
  PENDING_APPROVAL: "Awaiting approval",
  APPROVED: "Approved, not issued",
  ISSUED: "Issued",
  ACCEPTED: "Accepted",
  CANCELLED: "Cancelled",
};
export const AWARD_STATUS_TONE: Record<AwardStatus, "neutral" | "brand" | "info" | "ok" | "warn" | "err"> = {
  DRAFT: "neutral",
  PENDING_APPROVAL: "brand",
  APPROVED: "info",
  ISSUED: "ok",
  ACCEPTED: "ok",
  CANCELLED: "neutral",
};
export const INSTRUMENT_LABEL: Record<InstrumentKind, string> = { LETTER_OF_ACCEPTANCE: "Letter of Acceptance", WORK_INDENT: "Work indent and appointment letter" };
export const INSTRUMENT_SHORT: Record<InstrumentKind, string> = { LETTER_OF_ACCEPTANCE: "Letter of Acceptance", WORK_INDENT: "Work indent" };
export const DOCUMENT_LABEL: Record<DocumentKind, string> = {
  LETTER_OF_ACCEPTANCE: "Letter of Acceptance",
  SUCCESSFUL_BIDDER_DECLARATION: "Successful bidder's declaration",
  APPOINTMENT_LETTER: "Appointment letter",
  INDENT_COVERING_MEMO: "Indent covering memo",
};
export const DOCUMENT_SLUG: Record<DocumentKind, string> = {
  LETTER_OF_ACCEPTANCE: "letter-of-acceptance",
  SUCCESSFUL_BIDDER_DECLARATION: "declaration",
  APPOINTMENT_LETTER: "appointment-letter",
  INDENT_COVERING_MEMO: "covering-memo",
};
export const kindOfSlug = (slug: string) => (Object.entries(DOCUMENT_SLUG).find(([, s]) => s === slug)?.[0] ?? null) as DocumentKind | null;
export const LANGUAGE_LABEL: Record<DocumentLanguage, string> = { MS: "Malay", EN: "English" };
export const DELIVERY_LABEL: Record<DeliveryMethod, string> = { REGISTERED_POST: "Registered post", COLLECTION: "Collected", BY_HAND: "By hand" };
export const PERIOD_UNIT_LABEL: Record<PeriodUnit, [string, string]> = { DAYS: ["day", "days"], WEEKS: ["week", "weeks"], MONTHS: ["month", "months"] };
export const periodText = (n: number, u: PeriodUnit) => `${n} ${PERIOD_UNIT_LABEL[u][n === 1 ? 0 : 1]}`;
export const NON_COMMENCEMENT_LABEL: Record<NonCommencement, string> = { CANCEL_AND_BLACKLIST: "Cancellation, with blacklisting recommended", WARNING_LETTER: "A warning letter only" };
export const QUOTATION_KEY_LABEL: Record<QuotationContractKey, string> = { INDENT_NUMBER: "The indent's own number", CONTRACT_SERIES: "The contract type's series" };
export const COMMITMENT_KIND_LABEL = { INDENT: "Indent", PURCHASE_ORDER: "Purchase order" } as const;
export const BOND_BASIS_LABEL = { CONTRACT_PRICE: "Percentage of the contract price", ANNUAL_VALUE: "Percentage of a one-year value", STATED_AMOUNT: "A stated amount" } as const;
export const SECURITY_KIND_LABEL = { PERFORMANCE_BOND: "Performance bond", ADVANCE_PAYMENT_GUARANTEE: "Advance payment guarantee", DESIGN_GUARANTEE_BOND: "Design guarantee bond", RETENTION_BOND: "Retention bond" } as const;
export const SECURITY_FORM_LABEL = { BANK_GUARANTEE: "Bank guarantee", INSURANCE_GUARANTEE: "Insurance guarantee", CASH: "Cash", BANKERS_DRAFT: "Banker's draft" } as const;
export const INSURANCE_KIND_LABEL = { WORKS: "Works", PUBLIC_LIABILITY: "Public liability", WORKMENS_COMPENSATION: "Workmen's compensation", CAR: "Contractor's all risks", EAR: "Erection all risks" } as const;
export const WC_BASIS_LABEL = { UNCOVERED_WAGES: "Wages of employees not covered by social security", PERCENT_OF_CONTRACT: "A percentage of the contract sum" } as const;
export const REGISTER_STATUS_LABEL = { LODGED: "Lodged, not verified", VERIFIED: "Verified", REJECTED: "Rejected" } as const;
export const REGISTER_STATUS_TONE = { LODGED: "warn", VERIFIED: "ok", REJECTED: "err" } as const;
export const ISSUER_KIND_LABEL = { BANK: "Bank", INSURER: "Insurer", TAKAFUL: "Takaful operator" } as const;
export const CONTRACT_STATUS_LABEL = { NUMBER_ALLOCATED: "Number allocated", CANCELLED: "Cancelled — number kept as a gap" } as const;
export const GATE_LABEL = { RETURNED: "Instrument returned signed", BOND: "Performance bond lodged and verified", INSURANCE: "Every required policy lodged and verified" } as const;
export const GATE_STATE_LABEL = { MET: "Met", NOT_MET: "Not met", NOT_SET: "Not set" } as const;
export const RETURN_ITEM_LABEL = { SIGNED_LETTER: "the signed letter", DECLARATION: "the signed successful bidder's declaration", AUTHORISATION: "the letter of authorisation" } as const;
export const ACCEPTANCE_FAULT_LABEL = {
  SIGNATORY_NAME: "the contractor's signatory",
  IC_NUMBER: "the identity card number",
  OCCUPATION: "the occupation",
  ADDRESS: "the address",
  CAPACITY: "the capacity signed in",
  CONTRACTOR_SIGNATURE_NOT_RECORDED: "whether the contractor signed",
  CONTRACTOR_NOT_SIGNED: "the contractor's signature (recorded as not signed)",
  STAMP_NOT_RECORDED: "whether the company stamp is affixed",
  STAMP_NOT_AFFIXED: "the company stamp (recorded as not affixed)",
  WITNESS_NAME: "the witness's full name",
  WITNESS_SIGNATURE_NOT_RECORDED: "whether the witness signed",
  WITNESS_NOT_SIGNED: "the witness's signature (recorded as not signed)",
} as const;

const regime = (r: unknown) => (typeof r === "string" && r in REGIME_SHORT ? REGIME_SHORT[r as Regime].toLowerCase() : "an undetermined");
const docName = (k: unknown) => DOCUMENT_LABEL[k as DocumentKind] ?? "a document";

/// Where a fault is put right, for the link beside it.
export const FIX_AT: Record<string, { href: string; label: string }> = {
  INSTRUMENT_NOT_SET: { href: "/configuration/awards", label: "Award controls" },
  QUOTATION_KEY_NOT_SET: { href: "/configuration/awards", label: "Award controls" },
  RECIPIENTS_NOT_SET: { href: "/configuration/awards", label: "Award controls" },
  TEMPLATE_NOT_SET: { href: "/configuration/awards", label: "Award controls" },
  VARIANT_NONE: { href: "/configuration/awards", label: "Award controls" },
  VARIANT_AMBIGUOUS: { href: "/configuration/awards", label: "Award controls" },
  TEMPLATE_TEXT_NOT_SET: { href: "/configuration/templates", label: "Templates" },
  TEMPLATE_LANGUAGE_NOT_SET: { href: "/configuration/templates", label: "Templates" },
  TEMPLATE_UNKNOWN_FIELD: { href: "/configuration/templates", label: "Templates" },
  SIGNATORY_UNRESOLVED: { href: "/configuration/approval-matrix", label: "Approval matrix" },
  SIGNATORY_AMBIGUOUS: { href: "/configuration/approval-matrix", label: "Approval matrix" },
  SIGNATORY_GAP: { href: "/configuration/approval-matrix", label: "Approval matrix" },
  SIGNATORY_BOUNDARY_UNDECIDED: { href: "/configuration/approval-matrix", label: "Approval matrix" },
  NO_RULE: { href: "/configuration/approval-matrix", label: "Approval matrix" },
  NO_METHOD_KEY: { href: "/configuration/reference-data", label: "Reference data" },
  TERMS_UNDECIDED: { href: "/configuration/approval-matrix", label: "Approval matrix" },
  CONTRACT_SERIES_NOT_SET: { href: "/configuration/reference-data", label: "Reference data" },
  TIME_ZONE_UNSET: { href: "/configuration/organisation", label: "Organisation" },
  NO_ISSUE_IN_FORCE: { href: "/configuration/approval-matrix", label: "Approval matrix" },
};

/// The text of a finding from `src/lib/award` (and the method findings it passes through).
export function awardFindingText(f: Finding): string {
  const d = f.data ?? {};
  switch (f.code) {
    case "NO_ISSUE_IN_FORCE":
      return "No approval matrix is in force, so the award's route and signatory cannot be judged. Issue one under Configuration, Approval matrix.";
    // instrument.ts
    case "REGIME_NOT_DETERMINED":
      return "The exercise's regime has not been determined, so no instrument can be chosen. Save the exercise under an issue of the limits in force.";
    case "NO_AWARD_IN_REGIME":
      return "Below the quotation floor there is no award instrument in the portal: such a matter is ordered directly.";
    case "INSTRUMENT_NOT_SET":
      return `No award instrument is set for the ${regime(d.regime)} band. Set it under Award controls; nothing is assumed.`;
    case "VALUE_NOT_POSITIVE":
      return "The awarded value must be more than nothing.";
    case "NO_APPROVED_ROUTE":
      return "The requisition has no approved route on record, so there is no approved value to award against.";
    case "EXCEEDS_APPROVED_VALUE":
      return `With the requisition's other awards this comes to ${d.together}, above the ${d.approved} its approval covered. Reduce the awarded value, cancel another award, or raise a further requisition for the difference.`;
    case "VALUE_OUTSIDE_EXERCISE_REGIME":
      return `At this value the award falls in the ${regime(d.fresh)} band, not the ${regime(d.exercise)} band the exercise was classified in. It cannot be awarded until the exercise is classified again at this value.`;
    case "APPOINTMENT_BAND_CHANGED":
      return `At this value the appointment would be approved under “${d.fresh ?? "another rule"}”, not “${d.exercise ?? "the rule"}” the exercise was classified under. Classify the exercise again at this value first.`;
    case "ABOVE_ESTIMATE":
      return `Above the exercise's estimate of ${d.estimate} by ${d.difference}, within what the requisition's approval covered. The difference is not posted to the budget ledger: it waits for the finance system's commitment.`;
    // appointment.ts
    case "NOT_DRAFT":
      return "Only a draft award is sent for approval.";
    case "EXERCISE_NOT_IN_PREPARATION":
      return "The exercise must be in preparation, with its classification decided, before its award goes for approval.";
    case "ANOTHER_ROUTE_OPEN":
      return "An approval route is already open for this award.";
    case "DEPENDS_ON_METHOD":
      return "The exercise has no method, so who approves the appointment cannot be resolved.";
    case "NO_METHOD_KEY":
      return "The exercise's method names no key in the approval matrix, so who approves the appointment cannot be resolved. Set the method's approval key under Reference data.";
    case "NO_RULE":
      return `No approval rule approves this appointment at this value. It cannot be routed: escalate it to the immediate superior of the indicated approving authority, and record a rule or a known gap for it on the approval matrix.${d.messages ? ` ${d.messages}` : ""}`;
    case "ROUTE_ERROR":
      return `The appointment's route cannot be relied on: ${d.messages ?? "the approval matrix raised an error"}`;
    case "EVIDENCE_NOT_ATTACHED":
      return "A direct appointment is not approved without supporting evidence attached (its dossier), and the portal cannot store documents yet. This award cannot go for approval in the portal until it can; keep it as a draft, or cancel it.";
    // gate.ts
    case "NOT_APPROVED_YET":
      return "Only an approved award is issued.";
    case "EXERCISE_NOT_OPEN":
      return "The exercise is no longer in preparation.";
    case "REQUISITION_NOT_APPROVED":
      return d.step ? `The requisition has not completed its approval: ${d.step} has not yet decided. Nothing is issued against it until it has.` : "The requisition has not completed its approval. Nothing is issued against it until it has.";
    case "REQUISITION_NOT_ROUTED":
      return "The requisition has no approval route on record. Nothing is issued against it.";
    case "SOURCING_NOT_PERMITTED":
      return "The requisition's funding route does not let the organisation procure, so nothing is awarded on it.";
    case "SOURCING_NOT_RECORDED":
      return "Whether the requisition's funding route lets the organisation procure was not recorded.";
    case "APPOINTMENT_NOT_APPROVED":
      return d.step ? `The appointment is not approved yet: waiting on ${d.step}.` : "The appointment is not approved yet.";
    case "COMMITTEE_DECISION_NOT_RECORDED":
      return d.outcome === "DEFERRED"
        ? `The ${d.committee} deferred the matter; issue waits for its decision.`
        : d.outcome === "NOT_CARRIED"
          ? `The ${d.committee} did not carry the matter.`
          : `No decision of the ${d.committee} on this exercise is recorded. Table the award at a sitting and cite its decision on the Approval tab.`;
    case "NO_COMMITTEE_APPROVAL_IN_ROUTE":
      return "A Letter of Acceptance needs an approving committee's decision, and this appointment's route has none. Correct the appointment rule on the approval matrix.";
    case "SIGNATORY_UNRESOLVED":
      return "No signatory rule covers this instrument at this value, so nobody may sign it. Add the signatory rule on the approval matrix; the portal does not route round the gap.";
    case "SIGNATORY_AMBIGUOUS":
      return "More than one signatory rule matches this instrument at this value. Correct the overlapping rules on the approval matrix.";
    case "SIGNATORY_GAP":
      return "The signatory rule that matches is recorded as a known gap. A contract signatory cannot be an assumption: record the rule on the approval matrix.";
    case "SIGNATORY_BOUNDARY_UNDECIDED":
      return "The signatory rule has an edge on the boundary and nobody has decided whether it follows the boundary switch. Decide it on the approval matrix.";
    case "INDENT_NUMBER_REQUIRED":
      return "Record the finance system's indent number and the day it was received first. The portal consumes it and never issues one.";
    case "INDENT_NUMBER_FORMAT":
      return "The indent number does not match the finance system's format.";
    case "INDENT_EXPIRED":
      return `The indent expired on ${d.expiresOn}. The user department must ask Contract & Procurement to cancel it; cancel this award and raise a fresh indent.`;
    case "RECIPIENTS_NOT_SET":
      return "Nobody is set to receive a copy of this instrument. Set the distribution list under Award controls.";
    case "REGULATED_NOT_ANSWERED":
      return "Say whether the works are the regulated activity: a recipient's copy depends on it.";
    case "TEMPLATE_NOT_SET":
      return `No template is set for the ${docName(d.kind).toLowerCase()}. Set it under Award controls.`;
    case "TEMPLATE_TEXT_NOT_SET":
      return `The template “${d.template}” has no text, so the ${docName(d.kind).toLowerCase()} cannot be generated. Write it under Templates.`;
    case "TEMPLATE_LANGUAGE_NOT_SET":
      return `The template “${d.template}” has text in both languages and no language set to issue first. Set it under Templates.`;
    case "TEMPLATE_INCOMPLETE":
      return `The ${docName(d.kind).toLowerCase()} would be issued with ${String(d.fields ?? "").split(",").filter(Boolean).map((k) => mergeFieldLabel(k).toLowerCase()).join(", ")} not recorded. Record them first.`;
    case "TEMPLATE_UNKNOWN_FIELD":
      return `The template “${d.template}” names ${d.count} field${d.count === 1 ? "" : "s"} the portal does not fill. Correct it under Templates.`;
    case "VARIANT_NONE":
      return "No appointment-letter variant is set for this contract type and terms band. Add one under Award controls.";
    case "VARIANT_AMBIGUOUS":
      return "Two appointment-letter variants fit this contract type and terms band equally. Correct them under Award controls.";
    case "TERMS_NOT_SET":
      return "The exercise has no contract terms band set, so the appointment letter's variant cannot be chosen. Nothing is guessed.";
    case "TERMS_UNDECIDED":
      return "The exercise's terms band does not say whether retention and defects liability apply. Decide it on the approval matrix's terms bands.";
    case "RETENTION_REQUIRED":
      return "The terms band asks for retention: record the retention percentage and its limit.";
    case "DLP_REQUIRED":
      return "The terms band asks for a defects liability period: record it.";
    case "BOND_NOT_DECIDED":
      return "Decide whether this contract needs a performance bond. Nothing is assumed.";
    case "BOND_REASON_REQUIRED":
      return "Record why no performance bond is required.";
    case "BOND_BASIS_NOT_SET":
      return "The performance bond's basis is not set: choose what it is a percentage of, and the percentage. It is decided per contract and never defaulted.";
    case "CONTRACT_SERIES_NOT_SET":
      return "The contract type names no numbering series, so no contract number can be drawn. Set the contract series on the contract type under Reference data.";
    case "QUOTATION_KEY_NOT_SET":
      return "Where a quotation award's contract number comes from is not set. Set it under Award controls.";
    case "START_DATE_REQUIRED":
      return "Record the stated start date: the commencement clock and the insurance period run from it.";
    default:
      return methodFindingText(f);
  }
}

export const SIGNER_FAULT_TEXT = {
  NO_TIME_ZONE: "Set the organisation's time zone first.",
  NOT_HOLDER: "does not hold the signing office for the requisition's department on the day of signing, nor a delegation of it. Any other signature is refused.",
  INACTIVE: "has left the organisation.",
  DELEGATION_NOT_PERMITTED: "holds only a delegation, and this signature cannot be delegated.",
  OVER_CEILING: "holds a delegation whose ceiling is below the awarded value.",
  FUTURE_DATE: "The signing day cannot be after today.",
  BEFORE_APPROVAL: "The signing day cannot be before the appointment was approved.",
} as const;

export const DESPATCH_FAULT_TEXT = {
  METHOD_REQUIRED: "Say how the copy went.",
  DATE_REQUIRED: "Record the day it was despatched or collected.",
  CONSIGNMENT_REQUIRED: "A copy sent by registered post needs its consignment reference.",
  FUTURE_DATE: "A day cannot be after today.",
  BEFORE_ISSUE: "A copy cannot go before the instrument was issued.",
  ACK_BEFORE_DESPATCH: "An acknowledgement cannot come before the despatch.",
} as const;

export const BOND_FAULT_TEXT = {
  ISSUER_NOT_APPROVED: "The issuer is not on the approved list on the day it was lodged.",
  EXPIRY_REQUIRED: "The expiry date is not recorded.",
  BASIS_NOT_SET: "The bond's basis is not set on the award (D4), so what it must cover is not known.",
  BELOW_REQUIRED: "Its value is below the amount required.",
  VALIDITY_NOT_SET: "How long past completion it must run is not set on the award, or the start date is not recorded.",
  EXPIRES_TOO_EARLY: "It expires before completion plus the validity months.",
} as const;

export const INSURANCE_FAULT_TEXT = {
  ISSUER_NOT_APPROVED: "The insurer is not on the approved list on the day it was lodged.",
  BAD_SUBSTITUTION: "Only a contractor's or erection all-risks policy may stand in for the works policy.",
  SUM_BELOW_REQUIRED: "The sum insured is below what is required.",
  LIMIT_NOT_SET: "No liability bands are configured, so the limit cannot be derived. Set them under Award controls.",
  NO_BAND: "The contract price falls between the configured liability bands. It is refused, never placed: correct the bands under Award controls.",
  AMBIGUOUS_BAND: "The contract price falls in more than one liability band. Correct the bands under Award controls.",
  LIMIT_LOWERED: "The limit cannot be set below the one derived from the bands.",
  LIMIT_JUSTIFICATION_REQUIRED: "A limit raised above the derived one needs its justification recorded.",
  BELOW_LIMIT: "The sum insured is below the limit it must meet.",
  WC_BASIS_NOT_SET: "The award does not say how workmen's compensation is set (D4). Choose it on the award's Securities tab.",
  WC_PERCENT_NOT_SET: "The requirement gives no percentage of the contract sum for workmen's compensation.",
  PERIOD_NOT_SET: "How long it must run cannot be worked out: the start date, the defects liability period or the requirement's tail is not recorded.",
  PERIOD_TOO_SHORT: "It ends before the day it must run to.",
} as const;
