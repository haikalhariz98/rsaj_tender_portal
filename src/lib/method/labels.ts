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

export const EXERCISE_STATUS_LABEL: Record<ExerciseStatus, string> = {
  DRAFT: "Draft",
  DOCUMENTS_IN_PREPARATION: "Documents in preparation",
  CANCELLED: "Cancelled",
};
export const EXERCISE_STATUS_ORDER: readonly ExerciseStatus[] = ["DRAFT", "DOCUMENTS_IN_PREPARATION", "CANCELLED"];
export const EXERCISE_STATUS_TONE: Record<ExerciseStatus, "brand" | "info" | "neutral"> = {
  // As a requisition's draft reads (UX low).
  DRAFT: "neutral",
  DOCUMENTS_IN_PREPARATION: "info",
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
  MIXED_NO_DOMINANT: "Mixed scope with no deliverable above the dominance threshold, so no type is derived. Choose one, with a reason.",
  THRESHOLD_NOT_SET: "Mixed scope, and no dominance threshold is set, so there is no default for mixed scope. Choose a type, with a reason — or set the threshold under Reference data.",
  NO_TYPE_FOR_KIND: "No contract type is configured as the default for this deliverable. Choose one, with a reason — or set a deliverable on a type under Reference data.",
  SEVERAL_TYPES_FOR_KIND: "More than one contract type is configured as the default for this deliverable, so none is derived. Choose one, or correct the types under Reference data.",
  NO_SCOPE: "No scope split is recorded, so no type can be derived.",
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
  NONE_IN_REGIME: "Not applicable: the terms bands on the approval matrix cover other bands, not this one.",
  NO_BAND_FOR_VALUE: "Terms bands are set for this band, but none covers this value — a gap in the terms bands.",
  NOT_SET: "Not set: no contract terms bands are set on the issue in force.",
};

export const APPOINTMENT_STATE_TEXT: Record<AppointmentState, string> = {
  RESOLVED: "Resolved",
  DEPENDS_ON_METHOD: "The approver depends on the method: no single method is proposed in this band.",
  NO_METHOD_KEY: "This method is not tied to any approval rule, so nobody can be shown as approving its appointment. Set its approval matrix method under Reference data.",
  NO_RULE: "No approval rule matches this method at this value. Add a rule for it to the approval matrix, or record a known gap.",
};

export const NAME_STATE_TEXT: Record<NameApprovalState, string> = {
  NOT_REQUIRED: "Not required for this method.",
  NO_METHOD_KEY: "This method asks for name approval but is not tied to any approval rule. Set its approval matrix method under Reference data.",
  NO_RULE: "No approval rule for the name matches this method. Add one to the approval matrix.",
  HAS_COMMITTEE_STEP:
    "The route for name approval includes a committee step, and an exercise cannot yet be tabled at a sitting. Record the name approval outside the portal, or change the rule so that offices decide it.",
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
      return "The requisition has no approved route on record, so there is no approved value to open an exercise against.";
    case "EXCEEDS_APPROVED_VALUE":
      return `Together with the requisition's other live exercises this comes to ${money(d.combined)}, above the ${money(d.approved)} its approval covered. Reduce this exercise's value, cancel a sibling exercise, or cancel this exercise and raise a separate requisition for the difference. The requisition itself stays as approved.`;
    case "SPLIT_ACROSS_REGIME":
      return `This exercise's value is in a different band from the requisition's live exercises together (${money(d.combined)}). Check that the work is not being split below a threshold.`;
    case "REQUISITION_BAND_CHANGED":
      return `On its own value this exercise would be approved under “${d.ownRule ?? "another requisition band"}”, not “${d.approvedRule ?? "the band"}” the requisition was approved under. The requisition's approval stands; the difference is recorded.`;
    case "REQUISITION_BAND_NOT_CHECKED":
      return "The requisition's approval was received from outside and not checked against the approval matrix, so whether this exercise stays in its requisition band is not assessed.";
    // bands.ts, boundary.ts
    case "BOUNDARY_NOT_RULED":
      return `This value is exactly where the quotation and tender bands meet. ${boundarySentence(d.operator === "GTE" ? "GTE" : "GT", d.value == null ? null : String(d.value), d.provenance === "OBSERVED" ? "OBSERVED" : "ASSUMED")} It is recorded as an exception until the ruling is written into the approval matrix.`;
    case "TERMS_NOT_SET":
      return "No contract terms bands are set on the approval matrix in force, so which terms set applies is not set.";
    case "TERMS_NO_BAND":
      return "Terms bands are set for this band, but none covers this value.";
    case "TERMS_OVERLAP":
      return "More than one contract terms band covers this value; the first by order is shown. Correct the bands on the approval matrix.";
    case "APPOINTMENT_NO_RULE":
      return APPOINTMENT_STATE_TEXT.NO_RULE;
    case "APPOINTMENT_NO_METHOD_KEY":
      return APPOINTMENT_STATE_TEXT.NO_METHOD_KEY;
    case "DEPENDS_ON_METHOD":
      return APPOINTMENT_STATE_TEXT.DEPENDS_ON_METHOD;
    case "TENDER_NOT_ABOVE_QUOTATION":
      return "The tender floor must be above the quotation floor.";
    case "TENDER_FLOOR_NOT_BOUNDARY":
      return "The quotation and tender bands meet at the tender floor, so the boundary must be the same figure. Set it to the tender floor, or move the floor.";
    case "BOUNDARY_SOURCE_REQUIRED":
      return "A boundary ruling recorded as stated must cite the document that states it.";
    case "SWITCH_GOVERNS_NO_REGIME":
      return "The boundary is not the tender floor, so the boundary setting governs no band edge. Correct it on a new issue.";
    case "BOUNDARY_UNDECIDED":
      return `“${d.label}” has an edge on the boundary and nobody has decided whether it follows the boundary setting.`;
    case "REGIME_RULE_DISAGREE":
      return `“${d.label}” has an edge on the boundary and does not follow the boundary setting, so a value exactly on the boundary would fall in a different band from its method band.`;
    // eligibility.ts
    case "METHODS_NOT_SET":
      return "No sourcing method is configured. Add the methods under Configuration, Reference data.";
    case "SOURCING_NOT_PERMITTED":
      return "Under this requisition's funding route the organisation does not procure, so no sourcing exercise can be opened.";
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
      return "This method asks for a proposal, but no proposal items are configured for it. Add them under Reference data.";
    case "ITEM_EMPTY":
      return `“${d.item}” is empty.`;
    case "NOT_DRAFT":
      return "The proposal has already been submitted.";
    case "NOT_SUBMITTED":
      return "The proposal has not been submitted for review.";
    case "NOT_REVIEWED":
      return "The proposal must be reviewed by Contract & Procurement before the name is sent for approval.";
    case "REVIEWER_REQUIRED":
      return "Name who reviewed it.";
    case "FUTURE_DATE":
      return "The date cannot be after today.";
    case "TIME_ZONE_UNSET":
      return "Set the organisation's time zone under Configuration, Organisation first. Today's date decides this act, and it is not assumed to be UTC.";
    // justification.ts
    case "REASONS_NOT_SET":
      return "This method needs a reason code, and no justification reasons are configured. Add them under Configuration, Reference data.";
    case "REASON_REQUIRED":
      return "Choose the reason for the direct appointment.";
    case "REASON_UNKNOWN":
      return "That reason is not offered for this method.";
    case "EVIDENCE_NOT_ATTACHED":
      return "Supporting evidence is not attached: documents cannot be stored in the portal yet. The evidence note records what exists; it is not a pass.";
    case "DOSSIER_UNNUMBERED":
      return "The justification dossier has no reference yet. It is numbered when the exercise moves into preparation.";
    case "COORDINATION_RECORD_REQUIRED":
      return "An emergency needs its trigger and the date of the coordination meeting that fixed the scope.";
    case "SCOPE_DOCUMENT_NOT_ATTACHED":
      return "The scope document from the coordination meeting is not attached: documents cannot be stored in the portal yet.";
    // contract-type.ts
    case "SCOPE_REQUIRED":
      return "Record at least one scope line: what is delivered, and its value.";
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
      return "The requisition's live exercises already hold all of its approved value. Reduce or cancel one of them to open another.";
    case "SOURCING_NOT_RECORDED":
      return "Whether this requisition's funding route lets the organisation procure was not recorded when it was submitted, so no exercise can be opened.";
    // exercise.ts — the committee gate (FR-REQ-012, ruling C2)
    case "GATES_NOT_DETERMINED":
      return d.why === "NOT_SET"
        ? "Whether this requisition's funding route needs a committee gate before sourcing is not set, so no exercise can be opened. Set “Needs a committee gate” on the funding route under Configuration, Reference data, then check the committee gates."
        : d.why === "RULE_MISSING"
          ? "This requisition's funding route needs a committee gate, and no gate rule is in force for it, so no exercise can be opened. Add the gate rule under Configuration, Requisition controls, then check the committee gates."
          : "This requisition's committee gates have not been checked, so no exercise can be opened. Check the committee gates on its Approval tab.";
    case "GATE_AWAITING":
      return `The ${d.committee ?? "committee"} has not yet passed this requisition at its gate. Table it at a sitting and cite the decision on the requisition's Approval tab.`;
    case "GATE_RETURNED":
      return `The ${d.committee ?? "committee"} returned this requisition for revision at its gate. Revise the paper, table it again, and cite the new decision.`;
    case "GATE_ENDED":
      return `The ${d.committee ?? "committee"} ended this requisition at its gate, so it is not sourced. Close it without sourcing from its Approval tab.`;
    case "GATE_OUTCOME_NOT_RECORDED":
      return `The ${d.committee ?? "committee"} did not carry the matter, and its decision records no outcome saying whether it loops back or ends. Table the matter again.`;
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
      return "A classification needs a choice on the Contract type tab.";
    case "BLOCKING_FAULTS":
      return "The exercise has faults to correct: see the Classification tab.";
    case "DETERMINATION_CHANGED":
      return `Since it was last saved, the configuration now gives a different result for ${d.changes}. Open Edit and save it again, so the change is recorded, then move it.`;
    case "NAME_EXERCISE_CANCELLED":
      return "A cancelled exercise's name is not sent for approval.";
    case "NAME_NOT_ASKED":
      return "This exercise's method does not ask for name approval.";
    // actions
    case "NAME_REJECTION_UNRESOLVED":
      return "The name was refused and where it goes next is the officer's choice. Record the choice on the Name approval tab first.";
    case "NAME_ALREADY_REQUESTED":
      return "Name approval is already requested.";
    case "NAME_ROUTE_UNAVAILABLE":
      return String(d.text ?? "The route for name approval cannot be resolved.");
    default:
      return "A check did not pass.";
  }
}

/// Faults, as one sentence each, with the cancel reason worded for its act.
export const findingsText = (fs: readonly Finding[]) => fs.map(findingText);
