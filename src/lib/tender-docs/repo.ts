/**
 * Reading 6.4's rows as the rules see them. Every loader takes the client, so an action
 * reads inside its transaction on the rows it holds locked, and a screen reads the same
 * rows through the same mapping: a disabled button and a refused post give one reason.
 * Money arrives as Decimal and leaves as sen; percentages as their decimal strings.
 */

import { taxonomyUses } from "./config-conditions";
import type { Tx } from "@/lib/audit/record";
import { db } from "@/lib/db";
import { isLive } from "@/lib/documents/evidence";
import { storedDay } from "@/lib/dates";
import { senFromDecimal, type Sen } from "@/lib/money";
import { isClassificationSnapshot } from "@/lib/method/snapshot";
import { bqTotals, currentBq, type FrozenBq } from "@/lib/scope/bq";
import { lodgementBehind } from "@/lib/scope/estimate";
import type { PackInput } from "@/lib/scope/pack";
import { panelState } from "@/lib/scope/panel";
import { estimateFactsOf, linesOf, loadBqVersions, loadEstimates, loadPanel, loadScopeMatters, loadScopeRules } from "@/lib/scope/repo";
import { scopeApproval } from "@/lib/scope/scope-matter";

import type { AppendixFacts } from "./appendix";
import type { AssuranceKind, ConfirmationFacts } from "./assurance";
import type { ClauseFacts, OverrideFacts } from "./clauses";
import type { ConditionsInput } from "./conditions";
import type { RegistrationBodyFacts, RequirementFacts } from "./eligibility";
import type { PermitList } from "./permit";
import type { InsuranceTailPolicy } from "./appendix";
import type { PinnedFile } from "./freeze";
import type { ConfiguredPart, DocumentLanguage, PackKind, PackPartFacts, PartRole, Provenance, TemplateFacts } from "./types";

const dec = (v: { toString(): string } | null | undefined): Sen | null => (v == null ? null : senFromDecimal(v));
const pct = (v: { toString(): string } | null | undefined): string | null => (v == null ? null : v.toString());

// ------------------------------------------------------------------ configuration

export async function loadConfiguredParts(organisationId: string, client: Tx = db): Promise<(ConfiguredPart & { id: string; notes: string })[]> {
  const rows = await client.tenderDocumentPart.findMany({ where: { organisationId }, orderBy: [{ packKind: "asc" }, { sortOrder: "asc" }, { printedNumber: "asc" }] });
  return rows.map((r) => ({ ...r, provenance: r.provenance as Provenance, retiredOn: r.retiredOn ? storedDay(r.retiredOn) : null }));
}

export interface TenderPolicy {
  exists: boolean;
  restrictionStampTextEn: string | null;
  restrictionStampTextMs: string | null;
  assuranceRequired: boolean | null;
  ladDailyPct: string | null;
  ladDailyPctProvenance: Provenance | null;
  firstCertificateFloor: Sen | null;
  firstCertificatePct: string | null;
  firstCertificateProvenance: Provenance | null;
  insurance: InsuranceTailPolicy;
  insuranceExtraProvenance: Provenance | null;
  dbInsuranceExtraProvenance: Provenance | null;
  regulatorPermitTaxonomyCode: string | null;
  restrictionLabelEn: string | null;
  restrictionProvenance: Provenance | null;
  assuranceProvenance: Provenance | null;
  governingSource: string;
  notes: string;
}

/// The organisation's policy; every value unset where there is no row (never a default).
export async function loadTenderPolicy(organisationId: string, client: Tx = db): Promise<TenderPolicy> {
  const p = await client.tenderDocumentPolicy.findUnique({ where: { organisationId } });
  return {
    exists: !!p,
    restrictionStampTextEn: p?.restrictionStampTextEn ?? null,
    restrictionStampTextMs: p?.restrictionStampTextMs ?? null,
    assuranceRequired: p?.assuranceRequired ?? null,
    ladDailyPct: pct(p?.ladDailyPct),
    ladDailyPctProvenance: (p?.ladDailyPctProvenance as Provenance | null) ?? null,
    firstCertificateFloor: dec(p?.firstCertificateFloor),
    firstCertificatePct: pct(p?.firstCertificatePct),
    firstCertificateProvenance: (p?.firstCertificateProvenance as Provenance | null) ?? null,
    insurance: { extraMonths: p?.insuranceExtraMonths ?? null, extraDays: p?.insuranceExtraDays ?? null, dbExtraMonths: p?.dbInsuranceExtraMonths ?? null, dbExtraDays: p?.dbInsuranceExtraDays ?? null },
    insuranceExtraProvenance: (p?.insuranceExtraProvenance as Provenance | null) ?? null,
    dbInsuranceExtraProvenance: (p?.dbInsuranceExtraProvenance as Provenance | null) ?? null,
    regulatorPermitTaxonomyCode: p?.regulatorPermitTaxonomyCode ?? null,
    restrictionLabelEn: p?.restrictionLabelEn ?? null,
    restrictionProvenance: (p?.restrictionProvenance as Provenance | null) ?? null,
    assuranceProvenance: (p?.assuranceProvenance as Provenance | null) ?? null,
    governingSource: p?.governingSource ?? "",
    notes: p?.notes ?? "",
  };
}

export const templateFactsOf = (t: { id: string; code: string; nameEn: string; formCode: string; revisionDate: Date | null; bodyEn: string | null; bodyMs: string | null; primaryLanguage: string | null; bodyVersion: number }): TemplateFacts => ({
  id: t.id,
  code: t.code,
  nameEn: t.nameEn,
  formCode: t.formCode,
  revisionDate: t.revisionDate ? storedDay(t.revisionDate) : null,
  bodyEn: t.bodyEn,
  bodyMs: t.bodyMs,
  primaryLanguage: (t.primaryLanguage as DocumentLanguage | null) ?? null,
  bodyVersion: t.bodyVersion,
});

export async function loadTemplates(organisationId: string, client: Tx = db) {
  const rows = await client.documentTemplate.findMany({ where: { organisationId }, orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }] });
  return rows.map(templateFactsOf);
}

// ------------------------------------------------------------------ the pack

const PART_ATTACHMENTS = {
  where: { purpose: "TENDER_PART" as const },
  orderBy: [{ attachedAt: "asc" as const }, { id: "asc" as const }],
  select: { id: true, detachedAt: true, versionId: true, version: { select: { id: true, versionNo: true, sha256: true, withdrawnAt: true, documentId: true, document: { select: { title: true } } } } },
};

export const PACK_INCLUDE = {
  parts: { orderBy: [{ sortOrder: "asc" as const }, { printedNumber: "asc" as const }], include: { template: true, attachments: PART_ATTACHMENTS } },
  appendix: { include: { variationLimits: { orderBy: { sortOrder: "asc" as const } }, sections: { orderBy: { sortOrder: "asc" as const } } } },
  documents: { orderBy: [{ partCode: "asc" as const }, { language: "asc" as const }] },
  approvalInstance: { include: { steps: { orderBy: { sequence: "asc" as const }, include: { delegation: { select: { id: true, fromPerson: { select: { name: true } } } } } } } },
};

/// The exercise's packs, newest version first.
export async function loadPacks(exerciseId: string, client: Tx = db) {
  return client.tenderPack.findMany({ where: { exerciseId }, orderBy: { versionNo: "desc" }, include: PACK_INCLUDE });
}

export type PackRow = Awaited<ReturnType<typeof loadPacks>>[number];
export type PackPartRow = PackRow["parts"][number];
export type AppendixRow = NonNullable<PackRow["appendix"]>;

export function partFactsOf(p: PackPartRow): PackPartFacts {
  return {
    partCode: p.partCode,
    printedNumber: p.printedNumber,
    sortOrder: p.sortOrder,
    label: p.labelSnapshot,
    role: p.role as PartRole,
    content: p.content,
    source: p.source,
    mandatory: p.mandatory,
    inTableDocument: p.inTableDocument,
    returnedByBidder: p.returnedByBidder,
    returnedByBidderProvenance: p.returnedByBidderProvenance,
    templateCode: p.templateCode,
    template: p.template ? templateFactsOf(p.template) : null,
    state: p.state,
    omittedReason: p.omittedReason,
    liveUploads: p.attachments.filter(isLive).length,
  };
}

/// The live files of an uploaded part, as the freeze pins them.
export const pinnedFilesOf = (p: PackPartRow): PinnedFile[] =>
  p.attachments.filter(isLive).map((a) => ({ versionId: a.version.id, documentId: a.version.documentId, versionNo: a.version.versionNo, sha256: a.version.sha256, title: a.version.document.title }));

export function appendixFactsOf(a: AppendixRow): AppendixFacts {
  return {
    status: a.status,
    ladOfficerRoleCode: a.ladOfficerRoleCode,
    eotOfficerRoleCode: a.eotOfficerRoleCode,
    terminationOfficerRoleCode: a.terminationOfficerRoleCode,
    warRiskOfficerRoleCode: a.warRiskOfficerRoleCode,
    arbitrationOfficerRoleCode: a.arbitrationOfficerRoleCode,
    variationLimits: a.variationLimits.map((v) => ({ label: v.label, roleCode: v.roleCode, committeeCode: v.committeeCode, limit: dec(v.limit) })),
    pcSumWorksApply: a.pcSumWorksApply,
    pcSumWorksText: a.pcSumWorksText,
    tplMinimum: dec(a.tplMinimum),
    wcMinimum: dec(a.wcMinimum),
    worksInsuranceUpliftKind: a.worksInsuranceUpliftKind,
    worksInsuranceUpliftAmount: dec(a.worksInsuranceUpliftAmount),
    worksInsuranceUpliftPct: pct(a.worksInsuranceUpliftPct),
    insuranceExcess: dec(a.insuranceExcess),
    ladKind: a.ladKind,
    ladAmount: dec(a.ladAmount),
    ladPct: pct(a.ladPct),
    sectionalCompletion: a.sectionalCompletion,
    sections: a.sections.map((s) => ({ description: s.description, ladKind: s.ladKind, ladAmount: dec(s.ladAmount), ladPct: pct(s.ladPct) })),
    dlpApplies: a.dlpApplies,
    dlpMonths: a.dlpMonths,
    firstInterimMinimum: dec(a.firstInterimMinimum),
    subsequentInterimMinimum: dec(a.subsequentInterimMinimum),
    honourCertificateDays: a.honourCertificateDays,
  };
}

/// The behaviours the exercise was decided under, from its classification snapshot. Null: not recorded.
export function profileOf(classificationSnapshot: unknown) {
  return isClassificationSnapshot(classificationSnapshot) ? classificationSnapshot.contractType.profile : null;
}

// ------------------------------------------------------------------ 6.2's readiness, read for 6.4

/**
 * Everything 6.2's `packFaults` reads, and the bill a pack issues, for one exercise: its
 * bill versions, panel, live estimate and scope matters, and the method's and basis's
 * rules. Read inside the submission's transaction after the 6.2 rows are locked.
 */
export async function scopeReadiness(organisationId: string, ex: { id: string; sourcingMethodCode: string; contractBasisCode: string | null }, client: Tx = db) {
  // One after the other: inside a transaction the client is one connection.
  const versions = await loadBqVersions(ex.id, client);
  const panel = await loadPanel(ex.id, client);
  const estimates = await loadEstimates(ex.id, client);
  const rules = await loadScopeRules(organisationId, ex, client);
  const matters = await loadScopeMatters(ex.id, client);
  const live = estimates.find((e) => e.state !== "VOID");
  const facts = live ? estimateFactsOf(live) : null;
  const input: PackInput = {
    basis: rules.basis ? { requiresBq: rules.basis.requiresBq } : null,
    method: rules.method ? { requiresCompanyEstimate: rules.method.requiresCompanyEstimate } : null,
    bq: versions,
    panel: panelState(panel ? { status: panel.status, liveScanVersionIds: panel.liveScanVersionIds, verifiedSnapshot: panel.verifiedSnapshot } : null),
    panelBill: panel?.bqVersion ? { versionNo: panel.bqVersion.versionNo, status: panel.bqVersion.status } : null,
    estimate: facts ? { state: facts.state, behind: lodgementBehind(facts) } : null,
    scope: scopeApproval(rules.method, versions, matters).state,
  };
  const { finalised } = currentBq(versions);
  const bill: { versionId: string; frozen: FrozenBq; primeCostSums: Sen } | null = finalised
    ? {
        versionId: finalised.id,
        frozen: { versionNo: finalised.versionNo, sections: finalised.sections.map((s) => ({ number: s.number, title: s.title, items: linesOf({ ...finalised, sections: [s] }) })) },
        primeCostSums: bqTotals(linesOf(finalised), finalised.provisionalExcludedFromFirm).primeCostSums,
      }
    : null;
  const lastVersion = live?.versions[live.versions.length - 1] ?? null;
  return { input, bill, panelId: panel?.id ?? null, lastEstimateVersionOn: lastVersion ? storedDay(lastVersion.preparedOn) : null };
}

/// The pack kind an exercise assembles now, from its snapshot; null before document assembly.
export const packKindOf = (ex: { packKindSnapshot: PackKind | null }) => ex.packKindSnapshot;

// ------------------------------------------------------------------ increment 2: the tender's conditions

export async function loadRegistrationBodies(organisationId: string, client: Tx = db): Promise<(RegistrationBodyFacts & { id: string; governingSource: string; provenance: Provenance; notes: string; sortOrder: number })[]> {
  const rows = await client.registrationBody.findMany({ where: { organisationId }, orderBy: [{ sortOrder: "asc" }, { labelEn: "asc" }] });
  return rows.map((r) => ({ ...r, provenance: r.provenance as Provenance, retiredOn: r.retiredOn ? storedDay(r.retiredOn) : null }));
}

export async function loadRequirements(exerciseId: string, client: Tx = db): Promise<(RequirementFacts & { id: string })[]> {
  const rows = await client.exerciseRegistrationRequirement.findMany({ where: { exerciseId }, orderBy: [{ alternativeGroup: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }] });
  const bodies = rows.length ? await client.registrationBody.findMany({ where: { organisationId: rows[0].organisationId, code: { in: rows.map((r) => r.bodyCode) } }, select: { code: true, labelMs: true } }) : [];
  return rows.map((r) => ({ id: r.id, bodyCode: r.bodyCode, bodyLabel: r.bodyLabelSnapshot, bodyLabelMs: bodies.find((b) => b.code === r.bodyCode)?.labelMs ?? null, qualifierLabel: r.qualifierLabelSnapshot, qualifiers: r.qualifiers, alternativeGroup: r.alternativeGroup, sortOrder: r.sortOrder }));
}

export async function loadClauses(organisationId: string, client: Tx = db): Promise<(ClauseFacts & { id: string; governingSource: string; provenance: Provenance; notes: string; sortOrder: number })[]> {
  const rows = await client.clauseText.findMany({ where: { organisationId }, orderBy: [{ sortOrder: "asc" }, { titleEn: "asc" }] });
  return rows.map((r) => ({ ...r, provenance: r.provenance as Provenance, retiredOn: r.retiredOn ? storedDay(r.retiredOn) : null }));
}

/// Where each configured taxonomy is in use (mapping rows, exercises classified, policies naming it): what a permit list must not be (C2).
export async function loadTaxonomyUses(organisationId: string, client: Tx = db) {
  const [taxonomies, mappings, exerciseValues, scope] = await Promise.all([
    client.classificationTaxonomy.findMany({ where: { organisationId }, select: { code: true } }),
    client.taxonomyMapping.findMany({ where: { organisationId }, select: { taxonomyCode: true, whenTaxonomyCode: true } }),
    client.exerciseTaxonomyValue.findMany({ where: { exercise: { organisationId } }, select: { taxonomyCode: true } }),
    client.scopePolicy.findUnique({ where: { organisationId }, select: { panelContractKindTaxonomyCode: true, panelProjectStatusTaxonomyCode: true } }),
  ]);
  return taxonomyUses(
    taxonomies.map((t) => t.code),
    mappings,
    exerciseValues,
    scope ? [{ name: "specification panel's contract kind", codes: [scope.panelContractKindTaxonomyCode] }, { name: "specification panel's project status", codes: [scope.panelProjectStatusTaxonomyCode] }] : [],
  );
}

/// The configured list of permit types: the taxonomy the policy names. Null: none named, or no longer configured.
export async function loadPermitList(organisationId: string, taxonomyCode: string | null, today: string | null, client: Tx = db): Promise<PermitList | null> {
  if (!taxonomyCode) return null;
  const t = await client.classificationTaxonomy.findFirst({ where: { organisationId, code: taxonomyCode }, include: { values: { orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }] } } });
  if (!t) return null;
  const retired = (d: Date | null) => d != null && (today == null || storedDay(d) <= today);
  return { name: t.nameEn, values: t.values.map((v) => ({ code: v.code, label: v.nameEn, labelMs: v.nameMs, retired: retired(v.retiredOn) })) };
}

export async function loadOverrides(packId: string, client: Tx = db) {
  const rows = await client.clauseOverride.findMany({ where: { packId }, orderBy: { recordedAt: "asc" }, include: { person: { select: { name: true } } } });
  return rows.map((r) => ({ id: r.id, clauseCode: r.clauseCode, clauseTitle: r.clauseTitleSnapshot, personName: r.person.name, reason: r.reason, recordedAt: r.recordedAt })) satisfies OverrideFacts[];
}

export async function loadConfirmations(packId: string, client: Tx = db) {
  const rows = await client.packAssurance.findMany({ where: { packId }, orderBy: { kind: "asc" }, include: { person: { select: { name: true } } } });
  return rows.map((r) => ({ id: r.id, kind: r.kind as AssuranceKind, personName: r.person.name, confirmedOn: storedDay(r.confirmedOn), note: r.note })) satisfies ConfirmationFacts[];
}

/**
 * Everything `conditionsFaults` reads for one exercise and (where there is one) its pack, on
 * the organisation's day. Read inside the submission's transaction on locked rows, and by
 * the screens through the same mapping.
 */
export async function loadConditions(organisationId: string, ex: { id: string; restrictedTender: boolean | null; regulatedActivity: boolean | null; regulatorPermitCode: string | null }, packId: string | null, today: string, client: Tx = db): Promise<ConditionsInput> {
  const policy = await loadTenderPolicy(organisationId, client);
  const requirements = await loadRequirements(ex.id, client);
  const bodies = await loadRegistrationBodies(organisationId, client);
  const list = await loadPermitList(organisationId, policy.regulatorPermitTaxonomyCode, today, client);
  const clauses = await loadClauses(organisationId, client);
  const overrides = packId ? await loadOverrides(packId, client) : [];
  const confirmations = packId ? await loadConfirmations(packId, client) : [];
  return {
    today,
    eligibility: { requirements, bodies },
    restriction: { restricted: ex.restrictedTender, label: policy.restrictionLabelEn, stamp: { EN: policy.restrictionStampTextEn, MS: policy.restrictionStampTextMs } },
    permit: { regulated: ex.regulatedActivity, permitCode: ex.regulatorPermitCode, list },
    clauses: { clauses, overrides },
    assurance: { required: policy.assuranceRequired, confirmations },
  };
}
