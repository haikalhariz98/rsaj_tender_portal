/**
 * Everything an award's screen and its actions judge, in one pure pass.
 *
 * The repo reads the rows (inside the write's locked transaction when there is one)
 * and hands them here as plain facts; the page shows what comes back and the action
 * refuses on the same result, so the two can never disagree. Nothing here reads the
 * database or the clock.
 */

import { regimeFor } from "@/lib/authority/resolve";
import type { DecisionRecord } from "@/lib/committee/record";
import type { FunderContext } from "@/lib/method/approval";
import { snapshotFaults } from "@/lib/documents/evidence";
import { dossierFault } from "@/lib/method/justification";
import type { Method, PackKind } from "@/lib/method/types";
import { commitmentFault, type CommitmentFault } from "@/lib/requisition/commitment";
import type { ApprovalStatus, RequisitionStatus, StepDecision } from "@/lib/requisition/types";
import { bondRequiredUntil, requiredBond, type BondBasis, type RequiredBond } from "@/lib/securities/bond";
import { completionDay } from "@/lib/securities/period";
import { matchesFormat } from "@/lib/integration/award-commitment";
import type { Sen } from "@/lib/money";
import { bandingNumber } from "@/lib/method/bands";

import { appointmentRoute, submitFaults, type AppointmentRoute, type RoutePeople } from "./appointment";
import { commencementState } from "./commencement";
import { contractNumberSource } from "./contract-number";
import { distributionList, type Recipient } from "./distribution";
import { mergeFieldsFor, templateText, type MergeContext } from "./fields";
import { issueFaults, type DocumentState } from "./gate";
import { indentState } from "./indent";
import { awardValueFaults, instrumentChange, instrumentFor } from "./instrument";
import { renderedText, renderTemplate, type Rendered } from "./merge";
import { approverBlock, committeeBlock } from "./routing";
import { resolveSignatory } from "./signatory";
import { DOCUMENTS_FOR, type AwardPolicy, type AwardStatus, type DocumentKind, type DocumentLanguage, type Finding, type InstrumentKind, type NonCommencement, type PeriodUnit } from "./types";
import { selectVariant, termsAsked, type Variant } from "./variant";

export interface TemplateRow {
  id: string;
  code: string;
  nameEn: string;
  formCode: string;
  revisionDate: Date | null;
  bodyMs: string | null;
  bodyEn: string | null;
  primaryLanguage: DocumentLanguage | null;
  bodyVersion: number;
}

export interface RouteStepFact {
  id: string;
  sequence: number;
  roleCode: string | null;
  roleLabel: string;
  act: string;
  committeeCode: string | null;
  decision: StepDecision;
  decidedByName: string | null;
  decidedOn: Date | null;
  receivedOn: Date | null;
  /// The cited decision's record, and whether its sitting is minuted.
  cited: { record: DecisionRecord | null; minuted: boolean } | null;
}

export interface AwardFacts {
  today: string | null;
  organisationName: string;
  award: {
    status: AwardStatus;
    reference: string;
    instrumentKind: InstrumentKind;
    value: Sen;
    awardeeName: string;
    awardeeRegistrationNo: string;
    awardeeAddress: string;
    completionPeriod: number;
    completionUnit: PeriodUnit;
    startDate: string | null;
    commencedOn: string | null;
    regulatedActivity: boolean | null;
    bondRequired: boolean | null;
    bondNotRequiredReason: string;
    bondBasis: BondBasis | null;
    bondPercent: string | null;
    bondBasisAmount: Sen | null;
    bondValidityExtraMonths: number | null;
    ladAmount: Sen | null;
    ladUnit: string;
    retentionPercent: string | null;
    retentionCapPercent: string | null;
    dlpMonths: number | null;
    erpCommitmentNo: string | null;
    erpCommitmentKind: "INDENT" | "PURCHASE_ORDER" | null;
    indentReceivedOn: string | null;
    signatoryName: string | null;
    issuedOn: string | null;
    contractNumber: string | null;
    wcBasis: "UNCOVERED_WAGES" | "PERCENT_OF_CONTRACT" | null;
  };
  exercise: {
    reference: string;
    title: string;
    status: string;
    /// X-9: the pack kind recorded on the move into preparation; null before document assembly.
    packKindSnapshot: PackKind | null;
    regime: string | null;
    appointmentRuleKey: string | null;
    appointmentRuleLabel: string | null;
    termsBandKey: string | null;
    termsState: string | null;
    terms: { retentionApplies: boolean | null; defectsLiabilityApplies: boolean | null } | null;
    contractTypeCode: string | null;
    estimate: Sen;
    justificationReasonCode: string | null;
    dossierReference: string | null;
  };
  requisition: {
    reference: string;
    status: RequisitionStatus;
    sourcingPermitted: boolean | null;
    approvedValue: Sen | null;
    /// The requisition's latest route (requisition domain), for FR-REQ-016.
    route: { status: ApprovalStatus; steps: { sequence: number; roleLabel: string; decision: StepDecision }[] } | null;
  };
  otherAwards: readonly Sen[];
  policy: AwardPolicy;
  /// The issue in force, with the funder's rule set where the requisition's route supersedes.
  funder: FunderContext | null;
  method: Method | null;
  routePeople: RoutePeople;
  /// The award's latest appointment route.
  appointment: { status: ApprovalStatus; openedAt: Date; steps: readonly RouteStepFact[] } | null;
  /// The exercise's name-approval routes, for the CO-8 condition on submission.
  nameRoutes?: readonly { status: ApprovalStatus; openedAt: Date; createdAt?: Date | null; id?: string }[];
  recipients: readonly Recipient[];
  variants: readonly Variant[];
  templates: readonly TemplateRow[];
  indentPattern: string | null;
  contractSeriesKey: string | null;
  /// Whether the contract's insurance requirements include workmen's compensation.
  wcRequired: boolean;
  /// The exercise's dossier evidence as the document store counts it, the pins the award
  /// was sent for approval on, and which of those versions are withdrawn now. Not given:
  /// none — never a pass (FR-MTD-009, scope ruling).
  dossierEvidence?: { count: number; snapshot: unknown; withdrawnVersionIds: readonly string[] };
}

export interface DocumentPreview extends DocumentState {
  template: TemplateRow | null;
  language: DocumentLanguage | null;
  rendered: Rendered | null;
  fields: Record<string, string>;
}

export interface AwardEvaluation {
  instrument: ReturnType<typeof instrumentFor>;
  freshRegime: string | null;
  route: AppointmentRoute | null;
  valueFaults: Finding[];
  submitFaults: Finding[];
  signatory: ReturnType<typeof resolveSignatory> | null;
  variant: ReturnType<typeof selectVariant> | null;
  terms: { retentionAsked: boolean | null; dlpAsked: boolean | null; retentionSet: boolean; dlpSet: boolean } | null;
  documents: DocumentPreview[];
  distribution: ReturnType<typeof distributionList>;
  contractNumber: ReturnType<typeof contractNumberSource>;
  commitment: CommitmentFault | null;
  indent: ReturnType<typeof indentState> | null;
  indentFormatOk: boolean | null;
  requiredBond: RequiredBond;
  completion: string | null;
  bondUntil: string | null;
  commencement: ReturnType<typeof commencementState> | null;
  consequence: NonCommencement | null;
  committee: ReturnType<typeof committeeBlock> | null;
  approver: ReturnType<typeof approverBlock>;
  issueFaults: Finding[];
}

/// Values only the issue fills: shown as such on the preview, real in the frozen text.
export interface IssueValues {
  contractNumber: string;
  issueDate: string;
  signatoryName: string;
}

const PENDING_ON_ISSUE = { EN: "(allocated on issue)", MS: "(diperuntukkan semasa dikeluarkan)" } as const;
const NAMED_ON_ISSUE = { EN: "(named on issue)", MS: "(dinamakan semasa dikeluarkan)" } as const;
const ON_ISSUE: readonly string[] = [...Object.values(PENDING_ON_ISSUE), ...Object.values(NAMED_ON_ISSUE)];

/**
 * The fields of a text about to be frozen that still read as the preview's
 * "(allocated on issue)" or "(named on issue)". The issue fills them; any left is a
 * value the issue did not have, and the text is not frozen with it (BD-14).
 */
export function unfilledOnIssue(text: string, fields: Readonly<Record<string, string>>): string[] {
  if (!ON_ISSUE.some((p) => text.includes(p))) return [];
  const keys = Object.entries(fields).filter(([, v]) => ON_ISSUE.includes(v)).map(([k]) => k);
  return keys.length ? keys : ["unknown"];
}

export function evaluateAward(f: AwardFacts, issue?: IssueValues): AwardEvaluation {
  const a = f.award;
  const valueNum = bandingNumber(a.value);
  // Everything is judged on the instrument the award was opened with, which its text
  // and its Stage Two return follow. Where the policy now names another, the award is
  // refused until it is cancelled and opened again (INSTRUMENT_CHANGED), never re-read.
  const policyInstrument = instrumentFor(f.exercise.regime, f.policy);
  const kind: InstrumentKind = a.instrumentKind;
  const changed = instrumentChange(kind, policyInstrument);
  const instrument: { kind: InstrumentKind } | Extract<typeof policyInstrument, { fault: unknown }> = "fault" in policyInstrument ? policyInstrument : { kind };

  // The route and the regime, re-judged for the awarded value under the issue in force.
  const route = f.funder ? appointmentRoute(f.funder, f.method, valueNum, f.routePeople) : null;
  const freshRegime = f.funder ? regimeFor(valueNum, f.funder.dal.policy) : null;
  const valueFaults = awardValueFaults({
    value: a.value,
    estimate: f.exercise.estimate,
    exerciseRegime: f.exercise.regime,
    exerciseRuleKey: f.exercise.appointmentRuleKey,
    exerciseRuleLabel: f.exercise.appointmentRuleLabel,
    freshRegime,
    freshRuleKey: route?.ruleKey ?? null,
    freshRuleLabel: route?.ruleLabel ?? null,
    approvedValue: f.requisition.approvedValue,
    otherAwards: f.otherAwards,
  });
  const noIssue: Finding[] = f.funder ? [] : [{ code: "NO_ISSUE_IN_FORCE", level: "block" }];
  const dossier = { justificationReasonCode: f.exercise.justificationReasonCode, dossierReference: f.exercise.dossierReference, evidenceAttachments: f.dossierEvidence?.count ?? 0 };
  // At issue the evidence the appointment was approved on must still stand: a dossier
  // award with no snapshot, or one whose pinned version was since withdrawn, is refused.
  const judgedOn = f.method?.requiresDossier ? snapshotFaults(f.dossierEvidence?.snapshot ?? null, new Set(f.dossierEvidence?.withdrawnVersionIds ?? []), true) : [];
  const submit: Finding[] = [
    ...noIssue,
    ...(route ? submitFaults({ status: a.status, today: f.today, exerciseStatus: f.exercise.status, exercisePackKind: f.exercise.packKindSnapshot, openRoute: f.appointment?.status === "PENDING", method: f.method, dossier, route, nameRoutes: f.nameRoutes ?? [] }) : []),
    ...("fault" in instrument ? [{ code: instrument.fault, level: "block" as const, data: { regime: instrument.regime } }] : []),
    ...changed,
    ...valueFaults,
  ];

  const signatory = f.funder ? resolveSignatory(f.funder.dal, { kind, value: valueNum }) : null;

  // The appointment letter's variant and the terms its band asks for (indent only).
  const variant = kind === "WORK_INDENT" ? selectVariant(f.variants, f.exercise.contractTypeCode, { state: f.exercise.termsState, bandKey: f.exercise.termsBandKey }) : null;
  const asked = termsAsked(f.exercise.terms);
  const terms = kind === "WORK_INDENT" ? { retentionAsked: asked.retention, dlpAsked: asked.dlp, retentionSet: a.retentionPercent != null, dlpSet: a.dlpMonths != null } : null;

  const bond = requiredBond({ basis: a.bondBasis, percent: a.bondPercent, basisAmount: a.bondBasisAmount, contractPrice: a.value });
  const completion = a.startDate ? completionDay(a.startDate, a.completionPeriod, a.completionUnit) : null;
  const bondUntil = bondRequiredUntil(completion, a.bondValidityExtraMonths);
  const indent = kind === "WORK_INDENT" && f.today ? indentState(a.indentReceivedOn, f.policy.indentValidityDays, f.today) : null;
  const indentFormatOk = a.erpCommitmentNo ? matchesFormat(a.erpCommitmentNo, f.indentPattern) : null;

  // The routing sheet's blocks (FR-CTE-014): the last committee step's cited decision, and the approver.
  const steps = f.appointment?.steps ?? [];
  const lastCommittee = [...steps].reverse().find((s) => s.committeeCode);
  const committee = lastCommittee ? committeeBlock(lastCommittee.cited?.record ?? null, lastCommittee.cited?.minuted ?? false) : null;
  const approver = approverBlock(steps);
  const approverStep = [...steps].reverse().find((x) => (x.act === "A" || x.act === "MA") && !x.committeeCode);
  // A role's or committee's Malay name, from the matrix in force (a Malay letter uses it).
  const msName = (code: string | null) => (code ? (f.funder?.dal.roles[code]?.nameMs?.trim() || null) : null);

  // The documents, rendered as they would be issued.
  const templateFor = (d: DocumentKind): string | null =>
    d === "LETTER_OF_ACCEPTANCE" ? f.policy.loaTemplateId : d === "SUCCESSFUL_BIDDER_DECLARATION" ? f.policy.declarationTemplateId : d === "INDENT_COVERING_MEMO" ? f.policy.coveringMemoTemplateId : variant?.state === "SELECTED" ? variant.variant.templateId : null;
  const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
  const documents: DocumentPreview[] = DOCUMENTS_FOR[kind].map((dk) => {
    const tid = templateFor(dk);
    const t = tid ? (f.templates.find((x) => x.id === tid) ?? null) : null;
    const base = { kind: dk, template: t, templateName: t?.nameEn ?? null, missing: [], unknown: [], unfilled: [], language: null, rendered: null, fields: {} };
    if (!t) return { ...base, state: "TEMPLATE_NOT_SET" as const };
    const text = templateText(t);
    if ("fault" in text) return { ...base, state: text.fault };
    const L = text.language;
    const ctx: MergeContext = {
      lang: L,
      organisationName: f.organisationName,
      award: { reference: a.reference, value: a.value, issueDate: issue?.issueDate || a.issuedOn || f.today, completionPeriod: a.completionPeriod, completionUnit: a.completionUnit, startDate: a.startDate },
      awardee: { name: a.awardeeName, registrationNo: a.awardeeRegistrationNo, address: a.awardeeAddress },
      exercise: { reference: f.exercise.reference, title: f.exercise.title },
      requisitionReference: f.requisition.reference,
      contractNumber: issue?.contractNumber || a.contractNumber || PENDING_ON_ISSUE[L],
      signatory: { name: issue?.signatoryName || a.signatoryName || NAMED_ON_ISSUE[L], office: signatory?.ok ? { en: signatory.roleLabel, ms: msName(signatory.roleCode) } : null },
      terms: { ladAmount: a.ladAmount, ladUnit: a.ladUnit, retentionPercent: a.retentionPercent, retentionCapPercent: a.retentionCapPercent, dlpMonths: a.dlpMonths },
      bond: { amount: bond.state === "SET" ? bond.amount : null, percent: a.bondPercent, basis: a.bondBasis, validityMonths: a.bondValidityExtraMonths },
      indent: { number: a.erpCommitmentNo, receivedOn: a.indentReceivedOn, expiresOn: indent && "expiresOn" in indent ? indent.expiresOn : null },
      committee: committee?.state === "DECIDED" ? { name: { en: committee.committee, ms: msName(lastCommittee?.committeeCode ?? null) }, meetingReference: committee.meetingReference, meetingDate: day(committee.meetingDate)!, outcome: committee.outcome, decisionDate: day(committee.decisionDate) } : null,
      approver: approver ? { office: { en: approver.roleLabel, ms: msName(approverStep?.roleCode ?? null) }, receivedOn: day(approver.receivedOn), name: approver.approverName, decidedOn: day(approver.decidedOn) } : null,
    };
    const fields = mergeFieldsFor(ctx);
    const rendered = renderTemplate(text.body, fields);
    // Only the text being frozen is held to it: the preview shows the placeholders by design.
    const unfilled = issue ? unfilledOnIssue(renderedText(rendered), fields) : [];
    return { ...base, state: "OK" as const, language: L, rendered, fields, missing: rendered.missing, unknown: rendered.unknown, unfilled };
  });

  const distribution = distributionList(f.recipients, kind, a.regulatedActivity, a.awardeeName);
  const contractNumber = contractNumberSource(f.exercise.regime, f.policy.quotationContractKey, f.contractSeriesKey, { kind, commitmentNo: a.erpCommitmentNo, commitmentKind: a.erpCommitmentKind });
  const commitment = commitmentFault({ status: f.requisition.status }, f.requisition.route);
  const consequence = variant?.state === "SELECTED" ? variant.variant.nonCommencement : null;
  const commencement = kind === "WORK_INDENT" && f.today ? commencementState(a.startDate, a.commencedOn, f.policy.commencementGraceDays, f.today, consequence) : null;

  const pending = steps.find((s) => s.decision === "PENDING");
  const faults = issueFaults({
    status: a.status,
    today: f.today,
    exerciseStatus: f.exercise.status,
    exercisePackKind: f.exercise.packKindSnapshot,
    commitment,
    sourcingPermitted: f.requisition.sourcingPermitted,
    instrument,
    valueFaults: [...noIssue, ...changed, ...valueFaults],
    // FR-MTD-009: re-checked at issue, as at submission.
    dossierFaults: f.method ? [...dossierFault(f.method, dossier), ...judgedOn] : [],
    appointment: {
      status: f.appointment?.status ?? null,
      pendingStep: pending?.roleLabel ?? null,
      committeeSteps: steps.filter((s) => s.committeeCode).map((s) => ({ committee: s.roleLabel, act: s.act, outcome: s.cited?.record?.outcome ?? null })),
    },
    signatory: signatory ?? { ok: false, fault: "SIGNATORY_UNRESOLVED" },
    indent: kind === "WORK_INDENT" ? { number: a.erpCommitmentNo, formatOk: indentFormatOk, state: indent ?? { state: "NOT_RECEIVED" } } : null,
    distribution,
    documents,
    variant,
    terms,
    bond: { required: a.bondRequired, reason: a.bondNotRequiredReason, basis: bond },
    contractNumber,
    startDate: a.startDate,
    wc: { required: f.wcRequired, basis: a.wcBasis },
  });

  return {
    instrument,
    freshRegime,
    route,
    valueFaults,
    submitFaults: submit,
    signatory,
    variant,
    terms,
    documents,
    distribution,
    contractNumber,
    commitment,
    indent,
    indentFormatOk,
    requiredBond: bond,
    completion,
    bondUntil,
    commencement,
    consequence,
    committee,
    approver,
    issueFaults: faults,
  };
}
