/**
 * The words for everything `src/lib/method/**` returns as a key. Codes never reach a
 * screen (AGENTS.md rule 5): each finding, state and enum has its text here, tested.
 */

import { formatMoney, parseSen } from "@/lib/money";

import type { BehaviourKey } from "./profile";
import type { DerivationState } from "./contract-type";
import type { TaxonomyState } from "./taxonomy";
import type { TermsState } from "./bands";
import type { AppointmentState, NameApprovalState } from "./approval";
import type { ContractTypeState, DeliverableKind, ExerciseStatus, Finding, ProposalState, Regime } from "./types";

/// The three states the tender documents, their route and the exercise share (6.4 UX 2): one
/// label for one state wherever it is shown, so the badge, the step, the callout, the list and
/// the dashboard never say it two ways.
export const TENDERING_STATE_LABEL = {
  WITH_APPROVAL: "Awaiting approval for tendering",
  APPROVED: "Approved for tendering",
  RETURNED: "Returned for amendment",
} as const;

export const EXERCISE_STATUS_LABEL: Record<ExerciseStatus, string> = {
  DRAFT: "Draft",
  DOCUMENTS_IN_PREPARATION: "Documents in preparation",
  PENDING_APPROVAL_FOR_TENDERING: TENDERING_STATE_LABEL.WITH_APPROVAL,
  APPROVED_FOR_TENDERING: TENDERING_STATE_LABEL.APPROVED,
  ADVERTISED: "Advertised",
  INVITED: "Invited",
  OPENING_IN_PROGRESS: "Opening in progress",
  OPENED: "Opened",
  UNDER_EVALUATION: "Under evaluation",
  EVALUATED: "Evaluated",
  CANCELLED: "Cancelled",
};
export const EXERCISE_STATUS_ORDER: readonly ExerciseStatus[] = ["DRAFT", "DOCUMENTS_IN_PREPARATION", "PENDING_APPROVAL_FOR_TENDERING", "APPROVED_FOR_TENDERING", "ADVERTISED", "INVITED", "OPENING_IN_PROGRESS", "OPENED", "UNDER_EVALUATION", "EVALUATED", "CANCELLED"];
export const EXERCISE_STATUS_TONE: Record<ExerciseStatus, "brand" | "info" | "neutral" | "ok"> = {
  // As a requisition's draft reads (UX low).
  DRAFT: "neutral",
  DOCUMENTS_IN_PREPARATION: "info",
  // One colour for one meaning (status-tone): with approval is under way, approved is done.
  PENDING_APPROVAL_FOR_TENDERING: "brand",
  APPROVED_FOR_TENDERING: "ok",
  // 6.5: the window is under way; its phase (open for purchase, closed) is shown beside it.
  ADVERTISED: "brand",
  INVITED: "brand",
  // 6.7: the opening under way, then done.
  OPENING_IN_PROGRESS: "brand",
  OPENED: "ok",
  // 6.8: the evaluation under way, then its report issued.
  UNDER_EVALUATION: "brand",
  EVALUATED: "ok",
  CANCELLED: "neutral",
};
/// §7.3.2 gives cancellation no SOP path; the screen says so wherever it shows it.
export const CANCELLED_ASSUMPTION = "The procedure does not cover cancelling an exercise: this is recorded as the organisation's own step.";

/// One term per concept (UX 11).
export const TERM = {
  nameApproval: "Name approval",
  mixedThreshold: "Mixed-scope threshold",
  newExercise: "New exercise",
  notEnforced: "recorded, not enforced in this phase",
} as const;

export const REGIME_LABEL: Record<Regime, string> = {
  below: "Below the quotation floor",
  quotation: "Quotation band",
  tender: "Tender band",
};
export const REGIME_SHORT: Record<Regime, string> = { below: "Below quotation", quotation: "Quotation", tender: "Tender" };

export const DELIVERABLE_LABEL: Record<DeliverableKind, string> = {
  GOODS_DELIVERED: "Goods delivered",
  MEASURED_CONSTRUCTION: "Measured construction or installation",
  TERM_PERFORMANCE: "Performance over a term",
};

export const PROPOSAL_STATE_LABEL: Record<ProposalState, string> = {
  DRAFT: "Being prepared",
  SUBMITTED: "With Contract & Procurement for review",
  REVIEWED: "Reviewed",
};

export const TYPE_STATE_LABEL: Record<ContractTypeState, string> = {
  DERIVED: "Derived from the deliverable test",
  OVERRIDDEN: "Overridden",
  CHOSEN: "Chosen: no default could be derived",
};

export const DERIVATION_TEXT: Record<DerivationState, string> = {
  DERIVED: "Derived from the deliverable test.",
  MIXED_NO_DOMINANT: "No deliverable dominates. Choose a type, with a reason.",
  THRESHOLD_NOT_SET: "Mixed scope and no dominance threshold set. Choose a type, with a reason.",
  NO_TYPE_FOR_KIND: "No default type for this deliverable. Choose one, with a reason.",
  SEVERAL_TYPES_FOR_KIND: "Several default types for this deliverable. Choose one.",
  NO_SCOPE: "Deliverable not chosen. No type derived.",
};

export const TAXONOMY_STATE_LABEL: Record<TaxonomyState, string> = {
  DERIVED: "Derived",
  CHOSEN: "Chosen",
  AMBIGUOUS: "Needs a choice",
  NOT_MAPPED: "Not mapped",
  AWAITING_TYPE: "Waiting for the contract type",
};

export const TERMS_STATE_TEXT: Record<TermsState, string> = {
  APPLIES: "Applies",
  NONE_IN_REGIME: "Not applicable",
  NO_BAND_FOR_VALUE: "No terms band covers this value.",
  NOT_SET: "Not set",
};

export const APPOINTMENT_STATE_TEXT: Record<AppointmentState, string> = {
  RESOLVED: "Resolved",
  DEPENDS_ON_METHOD: "Approver depends on the method.",
  NO_METHOD_KEY: "Method has no approval rule. Set it under Reference data.",
  NO_RULE: "No approval rule matches this method at this value.",
};

export const NAME_STATE_TEXT: Record<NameApprovalState, string> = {
  NOT_REQUIRED: "Not required for this method.",
  NO_METHOD_KEY: "Name approval has no rule. Set the method under Reference data.",
  NO_RULE: "No name approval rule matches this method.",
  RESOLVED: "Resolved",
};

export const BEHAVIOUR_LABEL: Record<BehaviourKey, string> = {
  pricingBasis: "Pricing basis",
  registrationTest: "Registration eligibility test",
  administratorRoleCodes: "Contract administrator",
  startRequiresSecurities: "Start needs bond and insurances",
  eotInstrument: "Extension of time instrument",
  completionInstrument: "Completion instrument",
  defectsLiabilityApplies: "Defects liability period",
  makingGoodCertificate: "Certificate of making good defects",
  nominationAllowed: "Nomination and prime cost sums",
  interimPaymentRule: "Interim payment rule",
  sumAdjustmentDrivers: "Contract sum adjustment drivers",
  claimsApprovalCommitteeCode: "Approves claims before final account",
};

export const NOT_SET = "Not set";

/**
 * The boundary rule in one sentence, the same everywhere (UX 9): which band a value
 * exactly on the boundary falls in, and whether that is a written ruling.
 */
export function boundarySentence(operator: "GT" | "GTE", boundary: string | null, provenance: "STATED" | "OBSERVED" | "ASSUMED"): string {
  const at = boundary ? `exactly on ${formatMoney(parseSen(boundary))}` : "exactly on the boundary";
  const band = operator === "GTE" ? "tender" : "quotation";
  const source = provenance === "STATED" ? "stated" : provenance === "OBSERVED" ? "observed; not yet ruled" : "assumed; not yet ruled";
  return `A value ${at} falls in the ${band} band (${source}).`;
}

const money = (v: unknown) => String(v ?? "");

/// The text of a finding. Every code any module in `src/lib/method` returns is here.
export function findingText(f: Finding): string {
  const d = f.data ?? {};
  switch (f.code) {
    // value.ts — ruling R-16
    case "NO_APPROVED_ROUTE":
      return "Requisition has no approved route.";
    case "EXCEEDS_APPROVED_VALUE":
      return `With the other live exercises: ${money(d.combined)}, above the ${money(d.approved)} approved. Reduce this exercise's value, cancel a sibling exercise, or cancel this exercise. The requisition stays as approved.`;
    case "SPLIT_ACROSS_REGIME":
      return `Combined value (${money(d.combined)}) is in a different band. Check the work is not split.`;
    case "REQUISITION_BAND_CHANGED":
      return `On its own value: “${d.ownRule ?? "another requisition band"}”, not “${d.approvedRule ?? "the band"}”. Difference recorded.`;
    case "REQUISITION_BAND_NOT_CHECKED":
      return "Requisition approval not checked against the matrix. Band not assessed.";
    // bands.ts, boundary.ts
    case "BOUNDARY_NOT_RULED":
      return `Value is on the quotation and tender boundary. ${boundarySentence(d.operator === "GTE" ? "GTE" : "GT", d.value == null ? null : String(d.value), d.provenance === "OBSERVED" ? "OBSERVED" : "ASSUMED")} Recorded as an exception.`;
    case "TERMS_NOT_SET":
      return "No contract terms bands in force. Terms not set.";
    case "TERMS_NO_BAND":
      return "No terms band covers this value.";
    case "TERMS_OVERLAP":
      return "Several terms bands cover this value. First shown.";
    case "APPOINTMENT_NO_RULE":
      return APPOINTMENT_STATE_TEXT.NO_RULE;
    case "APPOINTMENT_NO_METHOD_KEY":
      return APPOINTMENT_STATE_TEXT.NO_METHOD_KEY;
    case "DEPENDS_ON_METHOD":
      return APPOINTMENT_STATE_TEXT.DEPENDS_ON_METHOD;
    case "TENDER_NOT_ABOVE_QUOTATION":
      return "The tender floor must be above the quotation floor.";
    case "TENDER_FLOOR_NOT_BOUNDARY":
      return "Boundary must equal the tender floor.";
    case "BOUNDARY_SOURCE_REQUIRED":
      return "A stated boundary must cite its document.";
    case "SWITCH_GOVERNS_NO_REGIME":
      return "Boundary is not the tender floor. Correct it on a new issue.";
    case "BOUNDARY_UNDECIDED":
      return `“${d.label}” has an edge on the boundary. Not decided whether it follows the setting.`;
    case "REGIME_RULE_DISAGREE":
      return `“${d.label}” does not follow the boundary setting. A boundary value lands in another band.`;
    // eligibility.ts
    case "METHODS_NOT_SET":
      return "No sourcing method set. Add them in Reference data.";
    case "SOURCING_NOT_PERMITTED":
      return "Funding route does not procure. No exercise can open.";
    case "METHOD_REQUIRED":
      return "Choose a sourcing method.";
    case "METHOD_UNKNOWN":
      return "That sourcing method is no longer configured.";
    case "METHOD_RETIRED":
      return `${d.method ?? "That method"} has been retired.`;
    case "METHOD_NOT_IN_REGIME":
      return `${d.method ?? "That method"} is not available ${d.regime === "below" ? "below the quotation floor" : `in the ${REGIME_SHORT[(d.regime as Regime) ?? "below"]?.toLowerCase() ?? ""} band`}.`;
    case "OVERRIDE_REASON_REQUIRED":
      return `The band proposes ${d.proposed ?? "another method"}. Say why a different method is used.`;
    case "EXTERNAL_ROUTE_NOTE_REQUIRED":
      return "An external body sets the sourcing route on this funding route. Record what it decided.";
    case "JUSTIFICATION_REQUIRED":
      return d.prompt ? `This method needs a justification: ${d.prompt}` : "This method needs a justification.";
    case "PARENT_CONTRACT_REQUIRED":
      return "A call-off draws on an existing contract. Record the contract's reference.";
    // approval.ts
    case "NAME_NOT_REQUESTED":
      return "Name approval has not been requested.";
    case "NAME_NOT_APPROVED":
      return "Name approval is still pending.";
    case "NAME_REJECTED":
      return "Name approval was refused.";
    // proposal.ts
    case "ITEMS_NOT_SET":
      return "No proposal items set. Add them in Reference data.";
    case "ITEM_EMPTY":
      return `“${d.item}” is empty.`;
    case "NOT_DRAFT":
      return "The proposal has already been submitted.";
    case "NOT_SUBMITTED":
      return "The proposal has not been submitted for review.";
    case "NOT_REVIEWED":
      return "Contract & Procurement must review the proposal first.";
    case "REVIEWER_REQUIRED":
      return "Name who reviewed it.";
    case "FUTURE_DATE":
      return "The date cannot be after today.";
    case "TIME_ZONE_UNSET":
      return "Time zone not set. Set it under Organisation.";
    // justification.ts
    case "REASONS_NOT_SET":
      return "No justification reasons set. Add them in Reference data.";
    case "REASON_REQUIRED":
      return "Choose the reason for the direct appointment.";
    case "REASON_UNKNOWN":
      return "That reason is not offered for this method.";
    case "EVIDENCE_NOT_ATTACHED":
      return "Supporting evidence not attached to the dossier.";
    case "DOSSIER_UNNUMBERED":
      return "Dossier numbered on moving to preparation.";
    case "COORDINATION_RECORD_REQUIRED":
      return "Emergency needs its trigger and coordination meeting date.";
    case "SCOPE_DOCUMENT_NOT_ATTACHED":
      return "Coordination meeting scope document not attached.";
    // contract-type.ts
    case "SCOPE_REQUIRED":
      return "Choose what is delivered.";
    case "SCOPE_AMOUNT_INVALID":
      return "Every scope line needs a value above zero.";
    case "SCOPE_SUM_MISMATCH":
      return `The scope lines add up to ${money(d.sum)}, not the exercise's ${money(d.value)}.`;
    case "LOCKED":
      return "The contract type is locked since award, and changes only by a controlled change.";
    case "TYPE_REQUIRED":
      return `Choose a contract type. ${DERIVATION_TEXT[(d.derivation as DerivationState) ?? "NO_SCOPE"] ?? ""}`.trim();
    case "TYPE_UNKNOWN":
      return "That contract type is no longer configured.";
    case "TYPE_REASON_REQUIRED":
      return d.derived ? "A type other than the derived one needs a reason." : "A chosen type needs a reason.";
    case "TYPE_PERSON_REQUIRED":
      return "Name who decided the type in Contract & Procurement.";
    case "BASIS_UNKNOWN":
      return "That contract basis is no longer configured.";
    // exercise.ts
    case "REQUISITION_NOT_APPROVED":
      return "Only an approved requisition can have a sourcing exercise.";
    case "FULLY_IN_EXERCISES":
      return "Live exercises hold all approved value. Reduce or cancel one.";
    case "SOURCING_NOT_RECORDED":
      return "Funding route procurement not recorded. No exercise can open.";
    // exercise.ts — the committee gate (FR-REQ-012, ruling C2)
    case "GATES_NOT_DETERMINED":
      return d.why === "NOT_SET"
        ? "Committee gate not set on the funding route. No exercise can open."
        : d.why === "RULE_MISSING"
          ? "No committee gate rule in force. No exercise can open."
          : "Committee gates not checked. Check them on its Approval tab.";
    case "GATE_AWAITING":
      return `${d.committee ?? "Committee"} has not passed this requisition. Table it, then cite the decision.`;
    case "GATE_RETURNED":
      return `${d.committee ?? "Committee"} returned this requisition. Revise, table again, cite the decision.`;
    case "GATE_ENDED":
      return `${d.committee ?? "Committee"} ended this requisition. Close it from its Approval tab.`;
    case "GATE_OUTCOME_NOT_RECORDED":
      return `${d.committee ?? "Committee"} did not carry it and recorded no outcome. Table it again.`;
    case "TERMINAL":
      return "A cancelled exercise stays cancelled.";
    case "NOT_ALLOWED":
      return "That move is not open from the exercise's current state.";
    case "CANCEL_REASON_REQUIRED":
      return "Say why it is cancelled.";
    case "METHOD_NOT_SET":
      return "The sourcing method is not set.";
    case "TYPE_NOT_SET":
      return "The contract type is not set.";
    case "BASIS_NOT_SET":
      return "The contract basis is not set.";
    case "PROPOSAL_NOT_REVIEWED":
      return "The proposal has not been reviewed.";
    case "TAXONOMY_AMBIGUOUS":
      return "A classification needs a choice under Details & compliance on Scope and estimate.";
    case "BLOCKING_FAULTS":
      return "The exercise has faults to correct: see Details & compliance on Scope and estimate.";
    case "DOCUMENTS_RULE_NOT_SET":
      return "The sourcing method does not say which tender documents it assembles. Set its document pack under Configuration, Tender documents, Sourcing methods.";
    case "NOT_BY_THIS_ACT":
      return d.act === "SUBMISSION"
        ? "Submit the tender documents for approval on the Tender documents tab."
        : d.act === "APPROVAL"
          ? "Approved for tendering only by its route's approving step."
          : d.act === "PUBLICATION"
            ? "Publish under Publishing on Tender documents once checks pass."
            : d.act === "WINDOW_CANCELLATION"
              ? "Cancel under Publishing on Tender documents, through an approved cancellation."
              : d.act === "UNSEAL"
                ? "Two present panel members must authorise, on the Opening tab."
                : d.act === "OPENING_FINALISED"
                  ? "Finalise the main opening on the Opening tab once checks pass."
                  : d.act === "EVALUATION_STARTED"
                    ? "Start the evaluation on the Evaluation tab once checks pass."
                    : d.act === "REPORT_ISSUED"
                      ? "Issue the evaluation report on the Evaluation tab once checks pass."
                      : d.act === "EVALUATION_REOPENED"
                        ? "Reopened only by a new evaluation version."
                        : "The exercise returns to preparation only when its route for tendering is rejected.";
    case "PACK_NOT_READY":
      return "Tender documents not ready. See the Tender documents tab.";
    case "DATES_REQUIRED":
      return "Record the tendering start and closing date with the approving decision.";
    case "PUBLISH_NOT_READY":
      return "Not ready to publish. See Publishing on Tender documents.";
    case "UNSEAL_NOT_AUTHORISED":
      return "Opens only once two different panel members present have authorised.";
    case "OPENING_NOT_READY":
      return "Opening not ready. See the Opening tab.";
    case "EVALUATION_NOT_READY":
      return "Evaluation cannot start. See the Evaluation tab.";
    case "REPORT_NOT_READY":
      return "Report not ready. See the Evaluation tab.";
    case "DETERMINATION_CHANGED":
      return `Configuration changed for ${d.changes}. Open Edit and save again.`;
    case "NAME_EXERCISE_CANCELLED":
      return "A cancelled exercise's name is not sent for approval.";
    case "NAME_LIST_FROZEN":
      return "Published, so the list stands: cancel the exercise and open a replacement.";
    case "NAME_NO_INVITEES":
      return "No invitees proposed. Add the invitees under Publishing first.";
    case "NAME_NOT_ASKED":
      return "This exercise's method does not ask for name approval.";
    // actions
    case "NAME_REJECTION_UNRESOLVED":
      return "Name refused. Record the officer's choice on the Name approval tab.";
    case "NAME_ALREADY_REQUESTED":
      return "Name approval is already requested.";
    case "NAME_ROUTE_UNAVAILABLE":
      return String(d.text ?? "The route for name approval cannot be resolved.");
    default:
      return "A check did not pass.";
  }
}

/**
 * A finding's text for a reader who may not read the exercise's estimate (Phase 3a, ADR 0034 D14). Two findings state amounts that are made of it
 * (the combined value of a requisition's live exercises, and the value its approval covered): for that reader they say so without the figures.
 * Every other finding is the same text. A reader who may read the estimate gets `findingText`.
 */
export function findingTextFor(f: Finding, amountsWithheld: boolean): string {
  if (!amountsWithheld) return findingText(f);
  switch (f.code) {
    case "EXCEEDS_APPROVED_VALUE":
      return "With the other live exercises, above the approved value (amounts are SULIT). Reduce or cancel an exercise.";
    case "SPLIT_ACROSS_REGIME":
      return "Combined value is in a different band (amounts are SULIT). Check the work is not split.";
    default:
      return findingText(f);
  }
}

/**
 * The findings as a reader is shown them on a record. Where the reader may not read the estimate (SULIT, FR-MTD-007) a finding that the value is exactly on a
 * band boundary is left out: the boundary is configuration anyone can read, so "exactly on it" says what the estimate is. Rewording it without the figure
 * would not help. A reader who may read the estimate is shown every finding.
 */
export const findingsShownTo = <F extends Finding>(fs: readonly F[], estimateWithheld: boolean): F[] => (estimateWithheld ? fs.filter((f) => f.code !== "BOUNDARY_NOT_RULED") : [...fs]);

/// The exercise's evidence lines (FR-MTD-009, FR-REQ-013): what is attached, as the document store counts it.
export function evidenceChip(count: number, what: "dossier" | "scope"): { text: string; tone: "ok" | "warn" } {
  if (count > 0) return { text: count === 1 ? "1 document attached" : `${count} documents attached`, tone: "ok" };
  return { text: what === "dossier" ? "Not attached" : "Scope document not attached", tone: "warn" };
}

export const EVIDENCE_NOTE_HINT = "What exists and where.";
export const SCOPE_NOTE_HINT = "What the meeting fixed.";
