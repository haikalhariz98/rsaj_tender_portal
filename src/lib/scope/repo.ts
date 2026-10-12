/**
 * 6.2's reads. Loading only: every rule is in the pure modules beside this. Each read takes
 * the caller's client, so a write reads inside its own locked transaction (`lock.ts`).
 * Nothing here reads the estimate's figure or its amendment reasons: the client omits them,
 * and only estimate-store.ts may set them back (ADR 0012).
 */

import type { Tx } from "@/lib/audit/record";
import { storedDay } from "@/lib/dates";
import { db } from "@/lib/db";
import { parseSen } from "@/lib/money";
import type { Provenance } from "@/lib/reference/types";
import { recordOf } from "@/lib/requisition/repo";

import type { EstimateFacts } from "./estimate";
import type { PanelColumn } from "./panel";
import type { RateIssue } from "./rates";
import type { ScopeMatter } from "./scope-matter";
import type { BqItemKind, BqLine, EstimateState, QualificationHolding, QualificationRow, ScopePolicy } from "./types";
import { UNSET_SCOPE_POLICY } from "./types";

const day = (d: Date | null | undefined) => (d ? storedDay(d) : null);

export async function loadScopePolicy(organisationId: string, client: Tx = db): Promise<ScopePolicy & { exists: boolean; notes: string }> {
  const p = await client.scopePolicy.findUnique({ where: { organisationId } });
  if (!p) return { ...UNSET_SCOPE_POLICY, exists: false, notes: "" };
  return {
    exists: true,
    notes: p.notes,
    specPanelUsed: p.specPanelUsed,
    onScreenBillUsed: p.onScreenBillUsed,
    measurementStandardLabel: p.measurementStandardLabel,
    measurementStandardProvenance: p.measurementStandardProvenance as Provenance | null,
    bqPreparerQualificationCode: p.bqPreparerQualificationCode,
    estimateLeadDays: p.estimateLeadDays,
    estimateLeadProvenance: p.estimateLeadProvenance as Provenance | null,
    estimateCustodianRoleCode: p.estimateCustodianRoleCode,
    estimateAuditRoleCode: p.estimateAuditRoleCode,
    estimateOverrideRoleCode: p.estimateOverrideRoleCode,
    panelSignatoryLimit: p.panelSignatoryLimit,
    panelSignatoryLimitProvenance: p.panelSignatoryLimitProvenance as Provenance | null,
    panelContractKindTaxonomyCode: p.panelContractKindTaxonomyCode,
    panelProjectStatusTaxonomyCode: p.panelProjectStatusTaxonomyCode,
    benchmarkLabelEn: p.benchmarkLabelEn,
    benchmarkLabelMs: p.benchmarkLabelMs,
  };
}

export async function loadQualifications(organisationId: string, client: Tx = db): Promise<(QualificationRow & { id: string; nameMs: string | null; governingSource: string; provenance: Provenance })[]> {
  const rows = await client.qualification.findMany({ where: { organisationId }, orderBy: { nameEn: "asc" } });
  return rows.map((q) => ({ id: q.id, code: q.code, nameEn: q.nameEn, nameMs: q.nameMs, governingSource: q.governingSource, provenance: q.provenance as Provenance, retiredOn: day(q.retiredOn) }));
}

export async function loadHoldings(organisationId: string, client: Tx = db, personIds?: readonly string[]): Promise<(QualificationHolding & { id: string; evidenceNote: string })[]> {
  const rows = await client.personQualification.findMany({ where: { organisationId, ...(personIds ? { personId: { in: [...personIds] } } : {}) }, orderBy: [{ personId: "asc" }, { validFrom: "asc" }] });
  return rows.map((h) => ({ id: h.id, personId: h.personId, qualificationCode: h.qualificationCode, validFrom: storedDay(h.validFrom), validTo: day(h.validTo), evidenceNote: h.evidenceNote }));
}

export async function loadPanelColumns(organisationId: string, client: Tx = db): Promise<(PanelColumn & { id: string; labelMs: string | null; orgUnitCode: string | null; sortOrder: number; provenance: Provenance })[]> {
  const rows = await client.specPanelColumn.findMany({ where: { organisationId }, orderBy: [{ sortOrder: "asc" }, { labelEn: "asc" }] });
  return rows.map((c) => ({ id: c.id, code: c.code, labelEn: c.labelEn, labelMs: c.labelMs, orgUnitCode: c.orgUnitCode, sortOrder: c.sortOrder, provenance: c.provenance as Provenance, retiredOn: day(c.retiredOn) }));
}

const bqInclude = {
  preparer: { select: { id: true, name: true } },
  sections: { orderBy: [{ sortOrder: "asc" as const }, { number: "asc" as const }], include: { items: { orderBy: [{ sortOrder: "asc" as const }, { itemRef: "asc" as const }] } } },
};

/// The exercise's bill versions, newest first, with their sections and lines.
export async function loadBqVersions(exerciseId: string, client: Tx = db) {
  return client.bqVersion.findMany({ where: { exerciseId }, orderBy: { versionNo: "desc" }, include: bqInclude });
}

export type BqVersionRow = Awaited<ReturnType<typeof loadBqVersions>>[number];

/// A stored line as the rules read it.
export function lineOf(i: { itemRef: string; description: string; unit: string; kind: string; quantity: { toString(): string } | null; rate: { toString(): string } | null; provisional: boolean }): BqLine {
  return { itemRef: i.itemRef, description: i.description, unit: i.unit, kind: i.kind as BqItemKind, quantity: i.quantity?.toString() ?? null, rate: i.rate == null ? null : parseSen(i.rate.toString()), provisional: i.provisional };
}

export const linesOf = (v: BqVersionRow) => v.sections.flatMap((s) => s.items.map(lineOf));

/// The panel with its standing and cleared verifications, the bill it names, and how many
/// live attachments of the signed form whose document is SULIT it holds (Q-1).
export async function loadPanel(exerciseId: string, client: Tx = db) {
  const p = await client.specificationPanel.findUnique({
    where: { exerciseId },
    include: {
      bqVersion: { select: { id: true, versionNo: true, status: true } },
      verifications: { orderBy: [{ recordedAt: "asc" }, { id: "asc" }], include: { person: { select: { id: true, name: true } } } },
    },
  });
  if (!p) return null;
  const live = await client.documentAttachment.findMany({
    where: { specificationPanelId: p.id, purpose: "SPEC_PANEL_FORM", detachedAt: null, version: { withdrawnAt: null, document: { classificationSnapshot: "SULIT" } } },
    select: { versionId: true },
  });
  // BD-62-26: which scans are live, so a verified panel is judged on the ones its snapshot names.
  return { ...p, liveSulitScans: live.length, liveScanVersionIds: live.map((a) => a.versionId) };
}

export type PanelRow = NonNullable<Awaited<ReturnType<typeof loadPanel>>>;

/// The exercise's estimates (void ones included), newest first: versions without their
/// figure or reason (omitted by the client), and every custody event.
export async function loadEstimates(exerciseId: string, client: Tx = db) {
  return client.companyEstimate.findMany({
    where: { exerciseId },
    orderBy: { createdAt: "desc" },
    include: {
      preparer: { select: { id: true, name: true } },
      versions: { orderBy: { versionNo: "asc" }, include: { preparer: { select: { id: true, name: true } } } },
      events: { orderBy: [{ at: "asc" }, { id: "asc" }], include: { person: { select: { id: true, name: true } } } },
    },
  });
}

export type EstimateRow = Awaited<ReturnType<typeof loadEstimates>>[number];

/// An estimate as the rules see it: never its figure.
export function estimateFactsOf(e: { id: string; state: string; preparerPersonId: string; currentVersionNo: number; classification: string; events: readonly { kind: string; versionNo: number | null }[] }): EstimateFacts & { id: string } {
  const last = (kind: string) => [...e.events].reverse().find((x) => x.kind === kind)?.versionNo ?? null;
  return {
    id: e.id,
    state: e.state as EstimateState,
    preparerPersonId: e.preparerPersonId,
    currentVersionNo: e.currentVersionNo,
    classification: e.classification as EstimateFacts["classification"],
    lodgedVersionNo: last("LODGED"),
    retainedVersionNo: last("RETAINED"),
  };
}

/// The exercise's method and basis flags as configured (null where no longer configured).
export async function loadScopeRules(organisationId: string, ex: { sourcingMethodCode: string; contractBasisCode: string | null }, client: Tx = db) {
  // One after the other: inside a transaction the client is one connection.
  const method = await client.sourcingMethod.findFirst({ where: { organisationId, code: ex.sourcingMethodCode }, select: { nameEn: true, requiresCompanyEstimate: true, requiresCompanyEstimateProvenance: true, scopeApprovalRequired: true, scopeApprovalProvenance: true, scopeCommitteeCode: true, scopeAct: true, scopeActProvenance: true } });
  const basis = ex.contractBasisCode ? await client.contractBasis.findFirst({ where: { organisationId, code: ex.contractBasisCode }, select: { nameEn: true, requiresBq: true, requiresBqProvenance: true } }) : null;
  return { method, basis };
}

/**
 * The SCOPE matters naming any of the exercise's bill versions (OD-9), as `scopeApproval`
 * reads them: each decision only through `decisionRecord()` (`recordOf`, the builder the
 * gates and the routing sheet use), with its committee and sitting.
 */
export async function loadScopeMatters(exerciseId: string, client: Tx = db): Promise<ScopeMatter[]> {
  const rows = await client.committeeDecision.findMany({
    // SR-09: a matter tables a bill version, or the version of the uploaded bill file (which names its exercise).
    where: { matterKind: "SCOPE", OR: [{ bqVersion: { exerciseId } }, { scopeExerciseId: exerciseId }] },
    orderBy: [{ tabledAt: "asc" }, { id: "asc" }],
    include: { meeting: { include: { committee: { select: { code: true, nameEn: true } } } }, votes: { include: { person: { select: { name: true } } } } },
  });
  return rows.map((d) => ({ id: d.id, bqVersionId: d.bqVersionId ?? d.scopeFileVersionId, committeeCode: d.meeting.committee.code, act: d.act, withdrawn: d.withdrawnAt != null, sittingCancelled: d.meeting.status === "CANCELLED", tabledAt: d.tabledAt, record: recordOf(d), sittingReference: d.meeting.reference, committeeName: d.meeting.committee.nameEn }));
}

/// The organisation's schedules of rates, issue by issue, as `rates.ts` reads them (days as YYYY-MM-DD).
export async function loadRateIssues(organisationId: string, client: Tx = db): Promise<(Omit<RateIssue, "items"> & { governingSource: string; provenance: Provenance; notes: string; issuedOn: string | null; supersededOn: string | null; issuedBy: string | null; items: (RateIssue["items"][number] & { id: string; unitText: string; descriptionMs: string | null; sortOrder: number })[] })[]> {
  const rows = await client.rateSchedule.findMany({
    where: { organisationId },
    orderBy: [{ label: "asc" }, { issueNo: "desc" }],
    include: { items: { orderBy: [{ sortOrder: "asc" }, { code: "asc" }] }, issuedBy: { select: { name: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    issueNo: r.issueNo,
    status: r.status,
    effectiveFrom: day(r.effectiveFrom),
    issuedOn: day(r.issuedOn),
    supersededOn: day(r.supersededOn),
    issuedBy: r.issuedBy?.name ?? null,
    governingSource: r.governingSource,
    provenance: r.provenance as Provenance,
    notes: r.notes,
    items: r.items.map((i) => ({ id: i.id, code: i.code, descriptionEn: i.descriptionEn, descriptionMs: i.descriptionMs, unit: i.unit, unitText: i.unit, rate: parseSen(i.rate.toString()), sortOrder: i.sortOrder })),
  }));
}

/// An active person of the organisation, by id, or null.
export async function activePerson(organisationId: string, personId: string | null, client: Tx = db) {
  if (!personId) return null;
  return client.person.findFirst({ where: { id: personId, organisationId, isActive: true }, select: { id: true, name: true } });
}
