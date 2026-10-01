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

import type { RequiredBond } from "@/lib/securities/bond";
import type { CommitmentFault } from "@/lib/requisition/commitment";

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
}

export interface IssueInput {
  status: AwardStatus;
  today: string | null;
  exerciseStatus: string;
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
  | "INDENT_EXPIRES_BEFORE_START";

export function issueFaults(i: IssueInput): Finding[] {
  const out: Finding[] = [];
  const f = (code: IssueFault, data?: Finding["data"]) => out.push({ code, level: "block", ...(data ? { data } : {}) });

  if (i.status !== "APPROVED") f("NOT_APPROVED_YET", { status: i.status });
  if (i.today == null) f("TIME_ZONE_UNSET");
  if (i.exerciseStatus !== "DOCUMENTS_IN_PREPARATION") f("EXERCISE_NOT_OPEN", { status: i.exerciseStatus });

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
      if (d.missing.length) f("TEMPLATE_INCOMPLETE", { kind: d.kind, template: d.templateName, fields: d.missing.join(",") });
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
  return out;
}
