/**
 * The award's words: every label and fault text the screens and actions show. Codes
 * are configuration keys and never reach a screen (AGENTS rule 5); where a fault has a
 * place it is put right, `FIX_AT` says where.
 */

import { openingFindingText } from "@/lib/opening/labels";
import { evaluationFindingText } from "@/lib/evaluation/labels";
import { bidFindingText } from "@/lib/bids/labels";
import { findingText as methodFindingText, REGIME_SHORT } from "@/lib/method/labels";
import type { Regime } from "@/lib/method/types";

import { formatDate } from "@/lib/format";

import { formatMoney } from "@/lib/money";
import { CONTRACT_STATUS_WORDS } from "@/lib/contract/labels";
import type { ContractStatus } from "@/lib/contract/types";
import { formatPct } from "@/lib/tender-docs/percent";

import { appendixInsured, BASELINE_FIELD_LABEL, type Baseline, type BaselineField } from "./appendix-baseline";
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
export const INSURANCE_KIND_LABEL = { WORKS: "Works insurance", PUBLIC_LIABILITY: "Public liability insurance", WORKMENS_COMPENSATION: "Workmen's compensation insurance", CAR: "Contractor's all risks insurance", EAR: "Erection all risks insurance" } as const;
export const WC_BASIS_LABEL = { UNCOVERED_WAGES: "On the wages of employees not covered by social security", PERCENT_OF_CONTRACT: "As a percentage of the contract sum" } as const;
export const REGISTER_STATUS_LABEL = { LODGED: "Lodged, not verified", VERIFIED: "Verified", REJECTED: "Rejected" } as const;
/// A workmen's compensation policy's sum, as the register shows it (BD-15).
export const WC_CHECK_LABEL = { CHECKED: "Sum checked against the contract sum", NOT_CHECKED: "Sum not checked: declared on uncovered wages", NOT_SET: "Sum not checked: how it is calculated is not set" } as const;
export const REGISTER_STATUS_TONE = { LODGED: "warn", VERIFIED: "ok", REJECTED: "err" } as const;
export const ISSUER_KIND_LABEL = { BANK: "Bank", INSURER: "Insurer", TAKAFUL: "Takaful operator" } as const;
/// 6.12 (X-8): every contract state, from the contract's own words.
export const CONTRACT_STATUS_LABEL: Readonly<Record<ContractStatus, string>> = Object.fromEntries(Object.entries(CONTRACT_STATUS_WORDS).map(([k, v]) => [k, v.en])) as Record<ContractStatus, string>;
export const GATE_LABEL = { RETURNED: "Instrument returned signed", BOND: "Performance bond lodged and verified", INSURANCE: "Every required policy lodged and verified" } as const;
export const GATE_STATE_LABEL = { MET: "Met", NOT_MET: "Not met", NOT_SET: "Not set" } as const;
/// The scans a return is bound to (OD-5), and what an award accepted before them reads.
export const RETURN_SCAN_LABEL = { SIGNED_LETTER: "the signed letter's scan", DECLARATION: "the signed declaration's scan", AUTHORISATION: "the letter of authorisation's scan", ACCEPTANCE_PAGE: "the acceptance page's scan" } as const;
/// What each scan slot is called on the Return tab: the same words as the card above it, which lists the items themselves.
export const RETURN_SLOT_LABEL = { SIGNED_LETTER: "Signed letter", DECLARATION: "Successful bidder's declaration", AUTHORISATION: "Letter of authorisation", ACCEPTANCE_PAGE: "Acceptance page" } as const;
/// A scan slot whose paper has not come back: nothing is overdue, and nothing is to be scanned yet.
export const WAITING_FOR_PAPER = "Waiting for the paper copy";
export const ACCEPTED_BEFORE_SCANS = "Accepted before scans were required";

/// The return drawer's description (FR-AWD-003, 008; OD-5; BD-24).
export const RETURN_DRAWER_NOTE = {
  recording: "The day each item came back, as the paper shows it. An item counts once its scan is attached to the award; the return that completes the instrument, every item with its scan, moves the award to Accepted.",
  correcting: "The award is accepted on this return. A correction is kept in the history with its reason, cannot leave the return incomplete, and needs the scan of the item it corrects.",
} as const;

/// The Return tab's attachments line: what is scanned, what is outstanding.
export function returnScansText(i: { required: boolean; missing: readonly (keyof typeof RETURN_SCAN_LABEL)[]; attached: number }): { text: string; tone: "ok" | "warn" | "neutral" } {
  if (!i.required) return { text: `${ACCEPTED_BEFORE_SCANS}${i.attached ? ` · ${i.attached} attached since` : ""}`, tone: "neutral" };
  if (i.missing.length) return { text: `Received on paper, scan not attached: ${i.missing.map((m) => RETURN_SCAN_LABEL[m]).join(", ")}. An item counts once its scan is attached.`, tone: "warn" };
  return i.attached ? { text: `Every item received has its scan attached (${i.attached})`, tone: "ok" } : { text: "Nothing received yet", tone: "neutral" };
}

/// The award tab and the award form, where a direct appointment's dossier has no evidence (replaces BD-4's copy).
export const DOSSIER_EVIDENCE_NEEDED = {
  title: "Attach the dossier evidence before it goes for approval",
  body: "A direct appointment is approved only with its supporting evidence attached to the dossier. The award can be opened now and kept as a draft; it is sent for approval once at least one document is attached to the exercise's dossier evidence.",
  short: "Record the awardee and the awarded value. It is sent for approval once the dossier has its evidence attached.",
} as const;

export const RETURN_ITEM_LABEL = { SIGNED_LETTER: "the signed letter", DECLARATION: "the signed successful bidder's declaration", AUTHORISATION: "the letter of authorisation" } as const;
export const ACCEPTANCE_FAULT_LABEL = {
  RECEIVED_ON: "the day it was received",
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
const instrumentName = (k: unknown) => (INSTRUMENT_SHORT[k as InstrumentKind] ?? "different instrument").toLowerCase().replace(/^letter of acceptance$/, "Letter of Acceptance");
/// Where a Malay letter's missing name is set: an office's or committee's Malay name on
/// its office (the role the approval matrix routes to), or the liquidated damages unit.
function malayNameHelp(fields: string[]): string {
  const parts: string[] = [];
  if (fields.some((k) => k === "signatory.office" || k === "approver.office")) parts.push("an office's Malay name (BM) is set on the office under Configuration, Users & roles — the office the approval matrix routes to");
  if (fields.includes("committee.name")) parts.push("a committee's Malay name (BM) is set on the committee's office under Configuration, Users & roles");
  if (fields.includes("terms.lad")) parts.push("the liquidated damages unit is written in Malay only when it is per day, per week or per month — choose it in the award's terms");
  return parts.length ? ` In a Malay letter: ${parts.join("; ")}.` : "";
}

const docName = (k: unknown) => DOCUMENT_LABEL[k as DocumentKind] ?? "a document";

/// Where a fault is put right, for the link beside it.
export const FIX_AT: Record<string, { href: string; label: string }> = {
  INSTRUMENT_NOT_SET: { href: "/configuration/awards", label: "Award controls" },
  QUOTATION_KEY_NOT_SET: { href: "/configuration/awards", label: "Award controls" },
  INDENT_NUMBER_NOT_AN_INDENT: { href: "/configuration/awards", label: "Award controls" },
  RECIPIENTS_NOT_SET: { href: "/configuration/awards", label: "Award controls" },
  TEMPLATE_NOT_SET: { href: "/configuration/awards", label: "Award controls" },
  VARIANT_NONE: { href: "/configuration/awards", label: "Award controls" },
  VARIANT_AMBIGUOUS: { href: "/configuration/awards", label: "Award controls" },
  TEMPLATE_TEXT_NOT_SET: { href: "/configuration/templates", label: "Templates" },
  TEMPLATE_LANGUAGE_NOT_SET: { href: "/configuration/templates", label: "Templates" },
  TEMPLATE_UNKNOWN_FIELD: { href: "/configuration/templates", label: "Templates" },
  SIGNATORY_UNRESOLVED: { href: "/configuration/approval-matrix", label: "Approval matrix" },
  SIGNATORY_NOT_FOR_INSTRUMENT: { href: "/configuration/approval-matrix", label: "Approval matrix" },
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
/// 68-C3 residual: a quotation's ceiling was never recorded, so an awarded value that differs from the
/// recommendation cannot be judged against it; the recommended price was judged when it was formed.
export const AWARD_CEILING_NOT_RECORDED = "This quotation's ceiling was never recorded when the exercise was classified, so an awarded value different from the recommendation cannot be judged against it. Award at the recommended price.";

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
    case "INSTRUMENT_CHANGED":
      return `This award was opened as a ${instrumentName(d.opened)}, and the award controls now name a ${instrumentName(d.now)} for its band. Its text and its return follow what it was opened as, so it is neither sent nor issued: cancel it and open a new award on the exercise. The new award goes through the appointment's approval again, with a fresh decision of the committee its route names.`;
    case "VALUE_NOT_POSITIVE":
      return "The awarded value must be more than nothing.";
    case "NO_APPROVED_ROUTE":
      return "The requisition has no approved route on record, so there is no approved value to award against.";
    case "EXCEEDS_APPROVED_VALUE":
      return Number(d.others ?? 0) > 0
        ? `With the requisition's other awards this comes to ${d.together}, above the ${d.approved} its approval covered. Reduce the awarded value, cancel another award, or raise a further requisition for the difference.`
        : `This is above the ${d.approved} the requisition's approval covered. Reduce the awarded value, or raise a further requisition for the difference.`;
    case "VALUE_OUTSIDE_EXERCISE_REGIME":
      return `At this value the award falls in the ${regime(d.fresh)} band, not the ${regime(d.exercise)} band the exercise was classified in. The classification is fixed once an award goes for approval, so it cannot be awarded on this exercise: cancel the award, and open a new exercise at this value.`;
    case "APPOINTMENT_BAND_CHANGED":
      return `At this value the appointment would be approved under “${d.fresh ?? "another rule"}”, not “${d.exercise ?? "the rule"}” the exercise was classified under. The classification is fixed once an award goes for approval: cancel the award, and open a new exercise at this value.`;
    case "ABOVE_ESTIMATE":
      return `Above the exercise's estimate of ${d.estimate} by ${d.difference}, within what the requisition's approval covered. The difference is not posted to the budget ledger: it waits for the finance system's commitment.`;
    // appointment.ts
    case "NOT_DRAFT":
      return "Only a draft award is sent for approval.";
    case "EXERCISE_NOT_IN_PREPARATION":
      return "The exercise must be in preparation, with its classification decided, before its award goes for approval.";
    case "EXERCISE_NOT_APPROVED_FOR_TENDERING":
      return "The exercise's tender documents must be approved for tendering before its award goes for approval.";
    case "EXERCISE_WINDOW_NOT_CLOSED":
      return "The exercise must have been advertised or invited, and its invitation window must have closed, before its award goes for approval.";
    case "WINDOW_CHANGE_PENDING":
      return "A change to the exercise's invitation window is with approval. The award goes for approval once it is decided.";
    // 6.7 (C-8): the award follows the opening's finalised schedule.
    case "EXERCISE_NOT_OPENED":
      return "The exercise's bids have not been opened, or its opening is not finalised. The award goes for approval once the opening's schedule is finalised, on Bids and opening.";
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
    case "REQUESTER_ONLY":
      return d.messages ? String(d.messages) : "The requisition's requester is the only officer able to act for a step of the appointment's route, and nobody decides a step of a matter they raised. Record a delegation of that office to another officer under Users & roles, or have another officer raise the requisition.";
    case "EVIDENCE_NOT_ATTACHED":
      return "A direct appointment is not approved without supporting evidence attached to its dossier. Attach at least one document to the exercise's dossier evidence, then send the award for approval.";
    // The dossier evidence the award was sent on (FR-MTD-009, scope ruling): re-checked at issue.
    case "EVIDENCE_NOT_SNAPSHOTTED":
      return "This direct appointment was sent for approval without a record of the evidence it was approved on, so it is not issued. Cancel this award and open it again: the new award is sent for approval on the evidence attached to the dossier.";
    case "EVIDENCE_WITHDRAWN_SINCE_JUDGED":
      return `“${d.title ?? "A document"}”${d.versionNo ? ` (version ${d.versionNo})` : ""}, part of the evidence this appointment was approved on, has since been withdrawn, so the award is not issued. Cancel this award and open it again, so the appointment is approved on the evidence that stands.`;
    // Close-out ruling CO-8: until 6.5 enforces it at invitation, at submission.
    case "NAME_NOT_REQUESTED":
      return "This method asks for approval of the name, and none has been requested (or the last request was withdrawn). Request it on the exercise's Name approval tab; the award goes for approval once the name is approved.";
    case "NAME_NOT_APPROVED":
      return "This method asks for approval of the name, and that approval is still in progress. The award goes for approval once the name is approved.";
    case "NAME_REJECTED":
      return "The name was refused. It is asked again, or goes where the refusal sent it, on the exercise's Name approval tab; the award goes for approval once a name is approved.";
    // gate.ts
    case "NOT_APPROVED_YET":
      return "Only an approved award is issued.";
    case "EXERCISE_NOT_OPEN":
      return d.needs === "WINDOW_CLOSED"
        ? d.changePending === "yes"
          ? "A change to the exercise's invitation window is with approval, so no award is issued on it until it is decided."
          : d.status === "ADVERTISED" || d.status === "INVITED" || d.status === "OPENING_IN_PROGRESS"
            ? "The exercise's bids have not been opened, or its opening is not finalised, so no award is issued on it."
            : "The exercise's invitation window has not closed, so no award is issued on it."
        : d.needs === "APPROVED_FOR_TENDERING"
          ? "The exercise's tender documents are not approved for tendering, so no award is issued on it."
          : "The exercise is no longer in preparation.";
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
    case "SIGNATORY_NOT_FOR_INSTRUMENT":
      return "The signatory rule that matches names no instrument, so it is not read as covering this one. On the approval matrix, give each signatory rule the instrument it signs as its condition (Letter of Acceptance, or work indent).";
    case "SIGNATORY_AMBIGUOUS":
      return "More than one signatory rule matches this instrument at this value. Correct the overlapping rules on the approval matrix.";
    case "SIGNATORY_GAP":
      return "The signatory rule that matches is recorded as a known gap. A contract signatory cannot be an assumption: record the rule on the approval matrix.";
    case "SIGNATORY_BOUNDARY_UNDECIDED":
      return "The signatory rule has an edge on the boundary and nobody has decided whether it follows the boundary switch. Decide it on the approval matrix.";
    case "INDENT_NUMBER_REQUIRED":
      return "Record the indent's commitment number, as the finance system gave it, and the day it was received.";
    case "INDENT_NUMBER_FORMAT":
      return "The indent number does not match the finance system's format.";
    case "INDENT_EXPIRED":
      return `The indent expired on ${typeof d.expiresOn === "string" ? formatDate(d.expiresOn) : "its expiry day"}. The user department must ask Contract & Procurement to cancel it; cancel this award and raise a fresh indent.`;
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
    case "TEMPLATE_INCOMPLETE": {
      const fields = String(d.fields ?? "").split(",").filter(Boolean);
      const where = d.language === "MS" ? malayNameHelp(fields) : "";
      return `The ${docName(d.kind).toLowerCase()} would be issued with ${fields.map((k) => mergeFieldLabel(k).toLowerCase()).join(", ")} not recorded. Record them first.${where}`;
    }
    case "ISSUE_VALUE_UNFILLED":
      return `The ${docName(d.kind).toLowerCase()} would be frozen with ${String(d.fields ?? "").split(",").filter((k) => k && k !== "unknown").map((k) => mergeFieldLabel(k).toLowerCase()).join(", ") || "a value"} still reading as the preview's placeholder. Nothing was issued.`;
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
      return "The performance bond's basis is not set: choose what it is a percentage of, and a percentage above 0. 0% is not a bond — where none is wanted, answer that no bond is required and say why.";
    case "CONTRACT_SERIES_NOT_SET":
      return "The contract type names no numbering series, so no contract number can be drawn. Set the contract series on the contract type under Reference data.";
    case "QUOTATION_KEY_NOT_SET":
      return "Where a quotation award's contract number comes from is not set. Set it under Award controls.";
    case "INDENT_NUMBER_NOT_AN_INDENT":
      return "Quotation contracts are set to take the indent's own number, and this award is not issued as a work indent, so it has none. A purchase order's number is never used: change where quotation contract numbers come from under Award controls.";
    case "INDENT_NUMBER_NOT_RECORDED":
      return "The contract takes the indent's own number, and no indent number is recorded on the award. Record it first.";
    case "WC_BASIS_REQUIRED":
      return "The contract must carry workmen's compensation, and the award does not say how it is calculated. Set it in the award's terms: it cannot be changed once the letter is issued.";
    case "INDENT_EXPIRES_BEFORE_START":
      return `The indent expires on ${typeof d.expiresOn === "string" ? formatDate(d.expiresOn) : "its expiry day"}, before the stated start date of ${typeof d.startDate === "string" ? formatDate(d.startDate) : "the works"}. Bring the start date forward, or have a fresh indent raised.`;
    case "START_DATE_REQUIRED":
      return "Record the stated start date: the commencement clock and the insurance period run from it.";
    // appendix-baseline.ts (64-C4, 6.4 Q-1 B)
    case "APPENDIX_DIFFERENCE_UNEXPLAINED":
      return d.field === "regulated"
        ? "Whether the works are the regulated activity differs from the tender's answer, and no reason is recorded. In Edit terms, answer as the tender did, or record why it differs."
        : `${BASELINE_FIELD_LABEL[d.field as BaselineField] ?? "A term"}: differs from the tender Appendix, and no reason is recorded. In Edit terms, state it as the Appendix does, or record why it differs.`;
    // 6.6 (X-9): the envelope register's checks, in the register's words.
    case "LATE_UNDECIDED":
    case "VALIDITY_NOT_SET":
    case "BID_VALIDITY_EXPIRED":
    case "VALIDITY_NOT_JUDGED":
      return bidFindingText(f);
    // 6.7 (C-7, C-8): the openings' checks, in the opening's words.
    case "OPENING_NOT_STARTED":
    case "OPENING_NOT_FINALISED":
    case "SIGNED_SCHEDULE_NOT_ATTACHED":
    case "ESTIMATE_COPY_UNEXPLAINED":
    case "SUPPLEMENTARY_NOT_FINALISED":
    case "ADMITTED_UNOPENED":
    case "AWARDEE_NOT_NAMED":
    case "AWARDEE_NOT_CARRIED":
      return openingFindingText(f);
    // 6.8 (E-9): the evaluation's gate, in the evaluation's words.
    case "NEVER_EVALUATED":
    case "NOT_EVALUATED":
    case "REPORT_STALE":
    case "AWARDEE_NOT_RECOMMENDED":
    case "CONSENT_NOT_FROM_RECOMMENDED":
    case "VALUE_DIFFERS_REASON_REQUIRED":
    case "PERIOD_DIFFERS_REASON_REQUIRED":
    // Phase 2 close-out 68-C3: a differing value above the frozen quotation ceiling.
    case "VALUE_ABOVE_CEILING":
      return evaluationFindingText(f);
    // Residual 2: the award's own exit (the evaluation's names cancelling the exercise, which does not fit an award).
    case "BOUNDARY_NOT_RECORDED":
      return AWARD_CEILING_NOT_RECORDED;
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
  BASIS_NOT_SET: "The bond's basis is not set on the award, so what it must cover is not known.",
  BELOW_REQUIRED: "Its value is below the amount required.",
  VALIDITY_NOT_SET: "How long past completion it must run is not set on the award, or the start date is not recorded.",
  EXPIRES_TOO_EARLY: "It expires before completion plus the validity months.",
} as const;

export const INSURANCE_FAULT_TEXT = {
  ISSUER_NOT_APPROVED: "The insurer is not on the approved list on the day it was lodged.",
  BAD_SUBSTITUTION: "Only contractor's or erection all risks insurance may stand in for the works insurance.",
  SUM_BELOW_REQUIRED: "The sum insured is below what is required.",
  LIMIT_NOT_SET: "No liability bands are configured, so the limit cannot be derived. Set them under Award controls.",
  NO_BAND: "The contract price falls between the configured liability bands. It is refused, never placed: correct the bands under Award controls.",
  AMBIGUOUS_BAND: "The contract price falls in more than one liability band. Correct the bands under Award controls.",
  LIMIT_LOWERED: "The limit cannot be set below the one derived from the bands.",
  LIMIT_JUSTIFICATION_REQUIRED: "A limit raised above the derived one needs its justification recorded.",
  BELOW_LIMIT: "The sum insured is below the limit it must meet.",
  WC_BASIS_NOT_SET: "The award does not say how workmen's compensation is calculated. Set it in the award's terms.",
  WC_PERCENT_NOT_SET: "The requirement gives no percentage of the contract sum for workmen's compensation.",
  PERIOD_NOT_SET: "How long it must run cannot be worked out: the start date, the defects liability period or the requirement's tail is not recorded.",
  PERIOD_TOO_SHORT: "It ends before the day it must run to.",
} as const;

/**
 * 64-C4: what the tender states for a term, in words, beside the award's own figure. Null
 * where the tender states nothing for it (nothing is compared). A percentage reads with the
 * figure it resolves to at the awarded sum.
 */
export function tenderTermText(field: BaselineField, b: Baseline): string | null {
  if (field === "lad") {
    if (!b.lad) return null;
    return b.lad.kind === "AMOUNT" ? `${formatMoney(b.lad.sen)} per day` : `${formatMoney(b.lad.sen)} per day: ${formatPct(b.lad.pct)} of the awarded sum a day`;
  }
  if (field === "dlp") return b.dlp ? (b.dlp.applies ? periodText(b.dlp.months, "MONTHS") : "None") : null;
  if (field === "regulated") return b.regulated == null ? null : b.regulated ? "Yes" : "No";
  // BD-613-2 ruling: the figure the Appendix governs for a sum insured.
  const g = appendixInsured(field, b);
  if (g == null) return null;
  return field === "worksInsured" ? `${formatMoney(g)}: the awarded sum plus the Appendix's uplift` : `${formatMoney(g)}: the Appendix's minimum`;
}

/// The refusal of a terms save that states a term otherwise with no reason, with what the tender states.
export function differsRefusal(field: BaselineField, said: string): string {
  const LEAD: Record<BaselineField, string> = {
    lad: "The liquidated damages differ from the tender Appendix",
    dlp: "The defects liability period differs from the tender Appendix",
    regulated: "The regulated-activity answer differs from the tender's",
    worksInsured: "The works sum insured differs from the figure the tender Appendix governs",
    liabilityInsured: "The public liability sum insured differs from the tender Appendix's minimum",
    wcInsured: "The workmen's compensation sum insured differs from the tender Appendix's minimum",
  };
  const lead = LEAD[field];
  return `${lead} (${said}): say why, or state it as the tender did.`;
}

/// The words beside a term the award states otherwise.
export const DIFFERS_TEXT: Record<BaselineField, string> = { lad: "Differs from the tender Appendix", dlp: "Differs from the tender Appendix", regulated: "Differs from the tender", worksInsured: "Differs from the tender Appendix", liabilityInsured: "Differs from the tender Appendix", wcInsured: "Differs from the tender Appendix" };
