/**
 * 6.4's rows as the trail records them: words, never codes; money formatted once
 * (`formatSen`); percentages as printed. Pure, so the actions and the demo loader write
 * the same shape, and History reads it as it stands.
 */

import { diffFields, type FieldChange } from "@/lib/audit/diff";
import { formatSen } from "@/lib/money";

import type { AppendixFacts } from "./appendix";
import { LAD_KIND_LABEL, NOT_SET, PACK_KIND_LABEL, PACK_STATUS_LABEL, PART_CONTENT_LABEL, PART_ROLE_LABEL, PART_SOURCE_LABEL, PART_STATE_LABEL, UPLIFT_KIND_LABEL, yesNoNotSet } from "./labels";
import { formatPct } from "./percent";
import type { PackKind, PackPartState, PartContent, PartRole, PartSource, TenderPackStatus } from "./types";

export const ENTITY = {
  pack: "TenderPack",
  part: "TenderPackPart",
  document: "TenderPackDocument",
  appendix: "ConditionsAppendix",
  variationLimit: "AppendixVariationLimit",
  section: "AppendixSection",
  config: "TenderDocumentPart",
  policy: "TenderDocumentPolicy",
} as const;

const money = (s: bigint | null) => (s == null ? NOT_SET : formatSen(s));
const pctText = (p: string | null) => (p == null ? NOT_SET : formatPct(p));

/// Liquidated damages in words: how they are stated, and the figure of that kind.
const ladText = (kind: AppendixFacts["ladKind"], amount: bigint | null, pct: string | null) =>
  kind == null ? NOT_SET : kind === "AMOUNT_PER_DAY" ? `${LAD_KIND_LABEL.AMOUNT_PER_DAY}: ${money(amount)}` : `${LAD_KIND_LABEL.PERCENT_OF_SUM_PER_DAY}: ${pctText(pct)}`;

/// The variation limits as one line, in their order: each holder by name, and its limit formatted.
function variationLimitsText(a: AppendixFacts, office: (code: string | null) => string): string {
  if (a.variationLimits.length === 0) return NOT_SET;
  return a.variationLimits.map((v) => `${v.label || office(v.roleCode ?? v.committeeCode)}: ${money(v.limit)}`).join("; ");
}

/// The sections as one line, in their order: each description and its liquidated damages.
function sectionsText(a: AppendixFacts): string {
  if (a.sections.length === 0) return NOT_SET;
  return a.sections.map((s) => `${s.description || "A section with no description"}: ${ladText(s.ladKind, s.ladAmount, s.ladPct)}`).join("; ");
}

/// The Appendix in words, field by field, for its trail. `office` names an office or committee by code.
/// The variation limits and the sections are part of it: adding, changing or removing one is a change of the Appendix.
export function appendixAuditView(a: AppendixFacts, office: (code: string | null) => string): Record<string, string | null> {
  return {
    ladOfficer: a.ladOfficerRoleCode ? office(a.ladOfficerRoleCode) : NOT_SET,
    eotOfficer: a.eotOfficerRoleCode ? office(a.eotOfficerRoleCode) : NOT_SET,
    terminationOfficer: a.terminationOfficerRoleCode ? office(a.terminationOfficerRoleCode) : NOT_SET,
    warRiskOfficer: a.warRiskOfficerRoleCode ? office(a.warRiskOfficerRoleCode) : NOT_SET,
    arbitrationOfficer: a.arbitrationOfficerRoleCode ? office(a.arbitrationOfficerRoleCode) : NOT_SET,
    variationLimits: variationLimitsText(a, office),
    primeCostSumWork: a.pcSumWorksApply == null ? NOT_SET : a.pcSumWorksApply ? a.pcSumWorksText || "Yes" : "None",
    thirdPartyMinimum: money(a.tplMinimum),
    workmensCompensationMinimum: money(a.wcMinimum),
    worksInsuranceUplift: a.worksInsuranceUpliftKind == null ? NOT_SET : a.worksInsuranceUpliftKind === "AMOUNT" ? `${UPLIFT_KIND_LABEL.AMOUNT}: ${money(a.worksInsuranceUpliftAmount)}` : `${UPLIFT_KIND_LABEL.PERCENT}: ${pctText(a.worksInsuranceUpliftPct)}`,
    insuranceExcess: money(a.insuranceExcess),
    liquidatedDamages: ladText(a.ladKind, a.ladAmount, a.ladPct),
    sectionalCompletion: yesNoNotSet(a.sectionalCompletion),
    sections: sectionsText(a),
    defectsLiabilityPeriod: a.dlpApplies == null ? NOT_SET : a.dlpApplies ? (a.dlpMonths == null ? NOT_SET : `${a.dlpMonths} months`) : "Does not apply",
    firstInterimMinimum: money(a.firstInterimMinimum),
    laterInterimMinimum: money(a.subsequentInterimMinimum),
    daysToHonourCertificate: a.honourCertificateDays == null ? NOT_SET : `${a.honourCertificateDays} days`,
  };
}

export const appendixAudit = (before: AppendixFacts | null, after: AppendixFacts, office: (code: string | null) => string): FieldChange[] =>
  diffFields(before ? appendixAuditView(before, office) : null, appendixAuditView(after, office));

export interface PartAuditFacts {
  printedNumber: string;
  label: string;
  role: PartRole;
  content: PartContent;
  source: PartSource;
  mandatory: boolean | null;
  state: PackPartState;
  omittedReason: string;
  templateName: string | null;
}

const partView = (p: PartAuditFacts) => ({
  part: `${p.printedNumber}. ${p.label}`,
  role: PART_ROLE_LABEL[p.role],
  content: PART_CONTENT_LABEL[p.content],
  source: PART_SOURCE_LABEL[p.source],
  mandatory: yesNoNotSet(p.mandatory),
  state: PART_STATE_LABEL[p.state],
  omittedBecause: p.state === "OMITTED" ? p.omittedReason : null,
  template: p.templateName,
});

export const partAudit = (before: PartAuditFacts | null, after: PartAuditFacts): FieldChange[] => diffFields(before ? partView(before) : null, partView(after));

export const packStatusAudit = (before: TenderPackStatus | null, after: TenderPackStatus, extra: Record<string, string | number | null> = {}): FieldChange[] =>
  diffFields(before ? { status: PACK_STATUS_LABEL[before] } : null, { status: PACK_STATUS_LABEL[after], ...extra });

export const packCreatedAudit = (i: { versionNo: number; packKind: PackKind; basis: string | null; form: string | null; parts: number; continues: number | null }): FieldChange[] =>
  diffFields(null, { version: i.versionNo, documentPack: PACK_KIND_LABEL[i.packKind], contractBasis: i.basis ?? NOT_SET, standardForm: i.form ?? NOT_SET, parts: i.parts, continuesVersion: i.continues });
