/**
 * Whether an approved award may be issued (FR-AWD-001–007, FR-REQ-016, FR-CON-002).
 *
 * Every reason at once, so the screen can say them all; the Issue action is not
 * rendered until this is empty, and the action re-runs it under the locks. The inputs
 * are judged elsewhere by their own rules — the requisition's `commitmentFault`, the
 * exercise's `dossierFault`, the value's `awardValueFaults`, the committee's
 * `decisionRecord()` — and this only puts them together. The signing Person is checked
 * by `checkSignatory` in the issue itself, once named.
 */

import type { PackKind } from "@/lib/method/types";
import { openingGateFaults, type OpeningGateFacts, type OpeningGateFault } from "@/lib/opening/award-gate";
import type { WindowGate } from "@/lib/window/gate";
import type { RequiredBond } from "@/lib/securities/bond";
import type { CommitmentFault } from "@/lib/requisition/commitment";

import { differenceFindings, type Difference } from "./appendix-baseline";
import type { NumberFault, NumberSource } from "./contract-number";
import type { ListFault } from "./distribution";
import type { IndentState } from "./indent";
import type { InstrumentFault } from "./instrument";
import type { Signatory } from "./signatory";
import type { AwardStatus, DocumentKind, Finding, InstrumentKind } from "./types";
import type { VariantResult } from "./variant";

export interface CommitteeStepState {
  committee: string;
  /// The cited decision's outcome, or null where none is cited.
  outcome: "CARRIED" | "NOT_CARRIED" | "DEFERRED" | null;
}

export interface DocumentState {
  kind: DocumentKind;
  state: "OK" | "TEMPLATE_NOT_SET" | "NO_TEXT" | "NO_LANGUAGE";
  templateName: string | null;
  missing: string[];
  unknown: string[];
  /// Fields of the text being frozen still reading "(allocated on issue)" (BD-14).
  unfilled: string[];
  /// The language it issues in, where its text is known.
  language?: "MS" | "EN" | null;
}

/**
 * X-9: the stage an exercise's award needs, by the pack kind it was prepared under. An
 * exercise prepared before document assembly (no snapshot) or with no pack keeps the
 * Phase 1 path: in preparation. 6.5 tightens 6.4's position (approved for tendering): one that
 * assembles a tender or quotation pack is awarded only once it was advertised or invited, its
 * window's phase is CLOSED (derived now, ADR 0014), and no change to the window is with approval.
 * 6.7 replaces this interim gate (X-9, C-8, flagged): the exercise must be Opened — its main opening
 * finalised — and the openings' own checks (`openingGateFaults`: the signed schedule's scan, every
 * admitted late tender opened, the estimate's copy finding explained, the awardee a party carried to
 * evaluation) are asked beside it. Accepted and issued awards are not judged again.
 */
export function awardableStatus(packKindSnapshot: PackKind | null): "DOCUMENTS_IN_PREPARATION" | "WINDOW_CLOSED" {
  return packKindSnapshot === "TENDER" || packKindSnapshot === "QUOTATION" ? "WINDOW_CLOSED" : "DOCUMENTS_IN_PREPARATION";
}

/// `window`: the window's phase and pending change (`windowGate`). Not given: not judged, never open.
export function exerciseOpenForAward(status: string, packKindSnapshot: PackKind | null, window: WindowGate | null = null): boolean {
  if (awardableStatus(packKindSnapshot) === "DOCUMENTS_IN_PREPARATION") return status === "DOCUMENTS_IN_PREPARATION";
  return status === "OPENED" && window?.phase === "CLOSED" && !window.changePending;
}

/// Why an award is not opened on the exercise, by what it needs.
export function awardOpenRefusal(packKindSnapshot: PackKind | null, status: string | null = null, window: WindowGate | null = null): string {
  if (awardableStatus(packKindSnapshot) === "DOCUMENTS_IN_PREPARATION") return "An award is opened only on an exercise in preparation, with its classification decided.";
  if (status !== "ADVERTISED" && status !== "INVITED" && status !== "OPENING_IN_PROGRESS" && status !== "OPENED") return "An award is opened only once the exercise was advertised or invited and its invitation window has closed.";
  if (window?.changePending) return "A change to the invitation window is with approval: an award waits for its decision.";
  // 6.7 (C-8): published, the award follows the opening's finalised schedule.
  if (status !== "OPENED") return "An award is opened only once the bids are opened and the opening's schedule is finalised, on Bids and opening.";
  return "An award is opened only once the invitation window has closed.";
}

/// 6.6 (X-9): what the envelope register asks of an award on an exercise published through 6.5 (`bidGate`).
export interface BidGateFacts {
  /// Late envelopes waiting for the committee's decision on admission (OD-6); null where none waits.
  lateFault: (Finding & { code: "LATE_UNDECIDED" }) | null;
  /// The bids' validity: not set, expired without an extension, or not judged; null where valid.
  validityFault: (Finding & { code: "VALIDITY_NOT_SET" | "BID_VALIDITY_EXPIRED" | "VALIDITY_NOT_JUDGED" }) | null;
}
export type BidGateFault = "LATE_UNDECIDED" | "VALIDITY_NOT_SET" | "BID_VALIDITY_EXPIRED" | "VALIDITY_NOT_JUDGED";

/// 6.7: the openings' faults, for submission and issue alike. Not given: nothing asked (an exercise not published through 6.5, X-9).
export const openingFindings = (o: { facts: OpeningGateFacts; awardeePartyId: string | null } | null | undefined): Finding[] => (o ? openingGateFaults(o.facts, o.awardeePartyId) : []);

/// The register's faults, for submission and issue alike. Null facts: not published through 6.5, nothing asked.
export const bidGateFindings = (b: BidGateFacts | null | undefined): Finding[] => (b ? [b.lateFault, b.validityFault].filter((f): f is NonNullable<typeof f> => f != null) : []);

export interface IssueInput {
  status: AwardStatus;
  today: string | null;
  exerciseStatus: string;
  /// The exercise's pack kind as recorded on the move into preparation (X-9). Null: before document assembly.
  exercisePackKind: PackKind | null;
  /// 6.5 (X-9): the window's phase and pending change. Not given: not judged, so not open.
  exerciseWindow?: WindowGate | null;
  /// 6.6 (X-9, flagged): late admission and the bids' validity. Not given: nothing asked.
  bids?: BidGateFacts | null;
  /// 6.7 (X-9, C-7, C-8, flagged): the openings' checks and the awardee's party. Not given: nothing asked.
  opening?: { facts: OpeningGateFacts; awardeePartyId: string | null } | null;
  commitment: CommitmentFault | null;
  sourcingPermitted: boolean | null;
  instrument: { kind: InstrumentKind } | { fault: InstrumentFault };
  valueFaults: readonly Finding[];
  dossierFaults: readonly Finding[];
  appointment: { status: string | null; pendingStep: string | null; committeeSteps: readonly (CommitteeStepState & { act: string })[] };
  signatory: Signatory;
  indent: { number: string | null; formatOk: boolean | null; state: IndentState } | null;
  distribution: { fault: ListFault } | { rows: unknown[] };
  documents: readonly DocumentState[];
  variant: VariantResult | null;
  terms: { retentionAsked: boolean | null; dlpAsked: boolean | null; retentionSet: boolean; dlpSet: boolean } | null;
  bond: { required: boolean | null; reason: string; basis: RequiredBond };
  contractNumber: NumberSource;
  startDate: string | null;
  /// Whether a workmen's compensation policy is required, and how the award sets it.
  wc: { required: boolean; basis: string | null };
  /// 64-C4 (6.4 Q-1 B): where the exercise froze a tender Appendix, the award's terms
  /// stated differently from it (`appendix-baseline.ts`). Not given: no frozen Appendix,
  /// nothing compared, as before.
  appendixDifferences?: readonly Difference[] | null;
}

export type IssueFault =
  | "NOT_APPROVED_YET"
  | "TIME_ZONE_UNSET"
  | "EXERCISE_NOT_OPEN"
  | "REQUISITION_NOT_APPROVED"
  | "REQUISITION_NOT_ROUTED"
  | "SOURCING_NOT_PERMITTED"
  | "SOURCING_NOT_RECORDED"
  | "APPOINTMENT_NOT_APPROVED"
  | "COMMITTEE_DECISION_NOT_RECORDED"
  | "NO_COMMITTEE_APPROVAL_IN_ROUTE"
  | InstrumentFault
  | "SIGNATORY_UNRESOLVED"
  | "SIGNATORY_NOT_FOR_INSTRUMENT"
  | "SIGNATORY_AMBIGUOUS"
  | "SIGNATORY_GAP"
  | "SIGNATORY_BOUNDARY_UNDECIDED"
  | "INDENT_NUMBER_REQUIRED"
  | "INDENT_NUMBER_FORMAT"
  | "INDENT_EXPIRED"
  | "RECIPIENTS_NOT_SET"
  | "REGULATED_NOT_ANSWERED"
  | "TEMPLATE_NOT_SET"
  | "TEMPLATE_TEXT_NOT_SET"
  | "TEMPLATE_LANGUAGE_NOT_SET"
  | "TEMPLATE_INCOMPLETE"
  | "TEMPLATE_UNKNOWN_FIELD"
  | "ISSUE_VALUE_UNFILLED"
  | "VARIANT_NONE"
  | "VARIANT_AMBIGUOUS"
  | "TERMS_NOT_SET"
  | "TERMS_UNDECIDED"
  | "RETENTION_REQUIRED"
  | "DLP_REQUIRED"
  | "BOND_NOT_DECIDED"
  | "BOND_REASON_REQUIRED"
  | "BOND_BASIS_NOT_SET"
  | NumberFault
  | "INSTRUMENT_CHANGED"
  | "START_DATE_REQUIRED"
  | "WC_BASIS_REQUIRED"
  | "INDENT_EXPIRES_BEFORE_START"
  | "APPENDIX_DIFFERENCE_UNEXPLAINED"
  | BidGateFault
  | OpeningGateFault;

export function issueFaults(i: IssueInput): Finding[] {
  const out: Finding[] = [];
  const f = (code: IssueFault, data?: Finding["data"]) => out.push({ code, level: "block", ...(data ? { data } : {}) });

  if (i.status !== "APPROVED") f("NOT_APPROVED_YET", { status: i.status });
  if (i.today == null) f("TIME_ZONE_UNSET");
  if (!exerciseOpenForAward(i.exerciseStatus, i.exercisePackKind, i.exerciseWindow ?? null)) f("EXERCISE_NOT_OPEN", { status: i.exerciseStatus, needs: awardableStatus(i.exercisePackKind), changePending: i.exerciseWindow?.changePending ? "yes" : null });
  // 6.6: late envelopes decided, and the bids still valid (or extended), on an exercise published through 6.5.
  out.push(...bidGateFindings(i.bids));
  // 6.7: the openings' checks and the awardee among the parties carried to evaluation (C-7).
  out.push(...openingFindings(i.opening));

  // FR-REQ-016: no commitment against a requisition that has not completed its approval.
  if (i.commitment?.code === "NOT_APPROVED") f("REQUISITION_NOT_APPROVED", { step: i.commitment.outstanding });
  else if (i.commitment?.code === "NO_APPROVAL_ROUTE") f("REQUISITION_NOT_ROUTED");
  if (i.sourcingPermitted === false) f("SOURCING_NOT_PERMITTED");
  else if (i.sourcingPermitted == null) f("SOURCING_NOT_RECORDED");

  // FR-AWD-001: the appointment approved, every committee step carried by the committee it names.
  if (i.appointment.status !== "APPROVED") f("APPOINTMENT_NOT_APPROVED", { step: i.appointment.pendingStep });
  for (const s of i.appointment.committeeSteps) if (s.outcome !== "CARRIED") f("COMMITTEE_DECISION_NOT_RECORDED", { committee: s.committee, outcome: s.outcome });
  const kind = "kind" in i.instrument ? i.instrument.kind : null;
  if (kind === "LETTER_OF_ACCEPTANCE" && i.appointment.status != null && !i.appointment.committeeSteps.some((s) => s.act === "A" || s.act === "MA")) f("NO_COMMITTEE_APPROVAL_IN_ROUTE");

  if ("fault" in i.instrument) f(i.instrument.fault);
  for (const v of i.valueFaults) if (v.level === "block") out.push(v);
  for (const d of i.dossierFaults) if (d.level === "block") out.push(d);
  if (!i.signatory.ok) f(i.signatory.fault);

  if (kind === "WORK_INDENT" && i.indent) {
    if (!i.indent.number) f("INDENT_NUMBER_REQUIRED");
    else if (i.indent.formatOk === false) f("INDENT_NUMBER_FORMAT");
    if (i.indent.state.state === "EXPIRED") f("INDENT_EXPIRED", { expiresOn: i.indent.state.expiresOn });
    // An indent that lapses before the stated start cannot carry the work it orders.
    else if ("expiresOn" in i.indent.state && i.startDate && i.startDate > i.indent.state.expiresOn) f("INDENT_EXPIRES_BEFORE_START", { expiresOn: i.indent.state.expiresOn, startDate: i.startDate });
  }

  if ("fault" in i.distribution) f(i.distribution.fault);

  for (const d of i.documents) {
    if (d.state === "TEMPLATE_NOT_SET") f("TEMPLATE_NOT_SET", { kind: d.kind });
    else if (d.state === "NO_TEXT") f("TEMPLATE_TEXT_NOT_SET", { kind: d.kind, template: d.templateName });
    else if (d.state === "NO_LANGUAGE") f("TEMPLATE_LANGUAGE_NOT_SET", { kind: d.kind, template: d.templateName });
    else {
      if (d.unknown.length) f("TEMPLATE_UNKNOWN_FIELD", { kind: d.kind, template: d.templateName, count: d.unknown.length });
      if (d.missing.length) f("TEMPLATE_INCOMPLETE", { kind: d.kind, template: d.templateName, fields: d.missing.join(","), language: d.language ?? null });
      if (d.unfilled.length) f("ISSUE_VALUE_UNFILLED", { kind: d.kind, fields: d.unfilled.join(",") });
    }
  }

  if (kind === "WORK_INDENT") {
    if (i.variant?.state === "NONE") f("VARIANT_NONE");
    else if (i.variant?.state === "AMBIGUOUS") f("VARIANT_AMBIGUOUS");
    else if (i.variant?.state === "TERMS_NOT_SET") f("TERMS_NOT_SET");
    if (i.terms) {
      if (i.terms.retentionAsked == null || i.terms.dlpAsked == null) f("TERMS_UNDECIDED");
      if (i.terms.retentionAsked && !i.terms.retentionSet) f("RETENTION_REQUIRED");
      if (i.terms.dlpAsked && !i.terms.dlpSet) f("DLP_REQUIRED");
    }
  }

  if (i.bond.required == null) f("BOND_NOT_DECIDED");
  else if (!i.bond.required && !i.bond.reason.trim()) f("BOND_REASON_REQUIRED");
  else if (i.bond.required && i.bond.basis.state === "NOT_SET") f("BOND_BASIS_NOT_SET");

  if ("fault" in i.contractNumber) f(i.contractNumber.fault);
  if (!i.startDate) f("START_DATE_REQUIRED");
  // The letter states the insurance it asks for; how workmen's compensation is set
  // cannot be changed once it is issued.
  if (i.wc.required && !i.wc.basis) f("WC_BASIS_REQUIRED");
  // A term stated differently from the tender Appendix is issued only with its reason.
  if (i.appendixDifferences) out.push(...differenceFindings(i.appendixDifferences));
  return out;
}
