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

/// The Appendix in words, field by field, for its trail. `office` names an office or committee by code.
export function appendixAuditView(a: AppendixFacts, office: (code: string | null) => string): Record<string, string | null> {
  return {
    ladOfficer: a.ladOfficerRoleCode ? office(a.ladOfficerRoleCode) : NOT_SET,
    eotOfficer: a.eotOfficerRoleCode ? office(a.eotOfficerRoleCode) : NOT_SET,
    terminationOfficer: a.terminationOfficerRoleCode ? office(a.terminationOfficerRoleCode) : NOT_SET,
    warRiskOfficer: a.warRiskOfficerRoleCode ? office(a.warRiskOfficerRoleCode) : NOT_SET,
    arbitrationOfficer: a.arbitrationOfficerRoleCode ? office(a.arbitrationOfficerRoleCode) : NOT_SET,
    primeCostSumWork: a.pcSumWorksApply == null ? NOT_SET : a.pcSumWorksApply ? a.pcSumWorksText || "Yes" : "None",
    thirdPartyMinimum: money(a.tplMinimum),
    workmensCompensationMinimum: money(a.wcMinimum),
    worksInsuranceUplift: a.worksInsuranceUpliftKind == null ? NOT_SET : a.worksInsuranceUpliftKind === "AMOUNT" ? `${UPLIFT_KIND_LABEL.AMOUNT}: ${money(a.worksInsuranceUpliftAmount)}` : `${UPLIFT_KIND_LABEL.PERCENT}: ${pctText(a.worksInsuranceUpliftPct)}`,
    insuranceExcess: money(a.insuranceExcess),
    liquidatedDamages: a.ladKind == null ? NOT_SET : a.ladKind === "AMOUNT_PER_DAY" ? `${LAD_KIND_LABEL.AMOUNT_PER_DAY}: ${money(a.ladAmount)}` : `${LAD_KIND_LABEL.PERCENT_OF_SUM_PER_DAY}: ${pctText(a.ladPct)}`,
    sectionalCompletion: yesNoNotSet(a.sectionalCompletion),
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
