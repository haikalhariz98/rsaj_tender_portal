/**
 * Sourcing exercises and their configuration, loaded. Reads only; every rule is in the
 * pure modules beside this. `withLockedExercise` is how every write reads: it locks the
 * parent requisition's row, then the exercise's, and re-reads both inside the write's
 * own transaction, so a sibling-sum check and the write it guards see the same data.
 */

import { routedValue } from "@/lib/approvals/routed-value";
import { exerciseEvidence, NO_EVIDENCE } from "@/lib/documents/evidence";
import { attachmentFacts } from "@/lib/documents/repo";
import type { Tx } from "@/lib/audit/record";
import { loadIssue, loadOverrideMatrix } from "@/lib/authority/load";
import { dayToDate, storedDay, todayIn } from "@/lib/dates";
import { db } from "@/lib/db";
import { parseSen } from "@/lib/money";
import { ORGANISATION_CODE } from "@/lib/org";
import type { Provenance } from "@/lib/reference/types";
import { fundingPosture } from "@/lib/reference/vocabulary";

import { historyChange } from "@/lib/scope/audit-view";

import { byValue } from "./bands";
import { EXERCISE_ROUTES_WHERE, type FunderContext } from "./approval";
import type { EvaluationContext, ExerciseDraft, MethodConfig } from "./evaluate";
import { classificationTaxonomies } from "./taxonomy";
import type { ContractTypeRow, DeliverableKind, ExerciseStatus, Method, TermsBand } from "./types";
import type { ApprovedRoute } from "./value";

const num = (v: { toString(): string } | null): number | null => (v == null ? null : Number(v.toString()));

export async function exerciseOrg(client: Tx = db) {
  const org = await client.organisation.findUnique({ where: { code: ORGANISATION_CODE }, select: { id: true, timeZone: true } });
  if (!org) return null;
  return { id: org.id, timeZone: org.timeZone, today: todayIn(new Date(), org.timeZone) };
}

export type ExerciseOrg = NonNullable<Awaited<ReturnType<typeof exerciseOrg>>>;

/// Methods with their behaviours and proposal items, and everything classification reads.
export async function loadMethodConfig(organisationId: string, client: Tx = db) {
  const where = { organisationId };
  const orderBy = [{ sortOrder: "asc" as const }, { nameEn: "asc" as const }];
  const [methods, reasons, types, bases, taxonomies, mappings, policy] = await Promise.all([
    client.sourcingMethod.findMany({ where, orderBy, include: { checklistItems: { orderBy: { sortOrder: "asc" } } } }),
    client.justificationReason.findMany({ where, orderBy }),
    client.contractType.findMany({ where, orderBy }),
    client.contractBasis.findMany({ where, orderBy }),
    client.classificationTaxonomy.findMany({ where, orderBy, include: { values: { orderBy: { sortOrder: "asc" } } } }),
    client.taxonomyMapping.findMany({ where }),
    client.classificationPolicy.findUnique({ where }),
  ]);
  // 6.4 increment 2: the regulator-permit list is a list, not a classification (FR-DOC-006).
  const permitList = (await client.tenderDocumentPolicy.findUnique({ where: { organisationId }, select: { regulatorPermitTaxonomyCode: true } }))?.regulatorPermitTaxonomyCode ?? null;
  const config: MethodConfig = {
    methods: methods.map((m) => {
      const { checklistItems, ...rest } = m;
      void checklistItems;
      return { ...rest, provenance: m.provenance as Provenance } as Method;
    }),
    reasons: reasons.map((r) => ({ ...r, provenance: r.provenance as Provenance })),
    types: types.map((t) => ({ ...t, deliverableKind: t.deliverableKind as DeliverableKind | null, provenance: t.provenance as Provenance }) as ContractTypeRow),
    bases,
    taxonomies: classificationTaxonomies(taxonomies, [permitList]).map((t) => ({ ...t, values: t.values })),
    mappings: mappings.map((m) => ({ ...m, provenance: m.provenance as Provenance })),
    policy: {
      dominanceSharePct: policy?.dominanceSharePct?.toString() ?? null,
      provenance: (policy?.provenance as Provenance | null) ?? null,
    },
  };
  const checklist = Object.fromEntries(methods.map((m) => [m.code, m.checklistItems]));
  // 64-C1: the permit list by name, so a screen can say which mappings it makes inert.
  const permitListRow = permitList ? (taxonomies.find((t) => t.code === permitList) ?? null) : null;
  return { config, checklist, permitList: permitListRow ? { code: permitListRow.code, nameEn: permitListRow.nameEn } : null, rows: { methods, reasons, types, bases, taxonomies, mappings, policy } };
}

export type LoadedMethodConfig = Awaited<ReturnType<typeof loadMethodConfig>>;

export async function loadTermsBands(authorityMatrixId: string, client: Tx = db): Promise<(TermsBand & { id: string })[]> {
  // In value order (UX 13, BD-24), by the same rule the lib reads them in.
  const rows = await client.termsBand.findMany({ where: { authorityMatrixId } });
  return rows.map((t) => ({
    id: t.id,
    bandKey: t.bandKey,
    minValue: num(t.minValue),
    maxValue: num(t.maxValue),
    regime: t.regime,
    labelEn: t.labelEn,
    retentionApplies: t.retentionApplies,
    defectsLiabilityApplies: t.defectsLiabilityApplies,
    insuranceNote: t.insuranceNote,
    followsBoundarySwitch: t.followsBoundarySwitch,
    clause: t.clause,
    provenance: t.provenance as Provenance,
    sortOrder: t.sortOrder,
  })).sort(byValue);
}

/**
 * The issue in force on a day with everything the bands read from it: the pure matrix,
 * its terms bands and its boundary ruling. Null where no issue is in force.
 */
export async function loadBandIssue(on: Date, client: Tx = db) {
  const issue = await loadIssue(ORGANISATION_CODE, on, undefined, null, client);
  if (!issue) return null;
  const [terms, meta] = await Promise.all([
    loadTermsBands(issue.id, client),
    client.authorityMatrix.findUniqueOrThrow({ where: { id: issue.id }, select: { boundaryProvenance: true, boundarySource: true } }),
  ]);
  return { ...issue, terms, boundaryProvenance: meta.boundaryProvenance as Provenance, boundarySource: meta.boundarySource };
}

const exerciseInclude = {
  scopeParts: { orderBy: { sortOrder: "asc" as const } },
  proposalAnswers: true,
  taxonomyValues: true,
  participants: { include: { person: { select: { id: true, name: true, isActive: true } } } },
  overriddenBy: { select: { id: true, name: true } },
  proposalReviewer: { select: { id: true, name: true } },
  approvalInstances: {
    // The exercise's own routes, of its own domains (ruling X-5). An award's appointment
    // route also names the exercise, but it is the award's: it never reads as a name
    // approval (6.11). Readers split them with `nameRoutesOf` / `tenderingRoutesOf`.
    where: EXERCISE_ROUTES_WHERE,
    // Newest first, same-day routes by when written, then by id (review #4, BD-17).
    orderBy: [{ openedAt: "desc" as const }, { createdAt: "desc" as const }, { id: "desc" as const }],
    include: {
      rejectionChosenBy: { select: { name: true } },
      steps: {
        orderBy: { sequence: "asc" as const },
        include: { declaredBy: { select: { name: true } }, delegation: { select: { id: true, valueCeiling: true, fromPerson: { select: { name: true } } } } },
      },
    },
  },
};

const requisitionInclude = {
  requestingPerson: { select: { id: true, name: true } },
  approvalInstances: { orderBy: { openedAt: "desc" as const }, include: { steps: { select: { decidedByPersonId: true } } } },
  exercises: { select: { id: true, reference: true, title: true, estimatedValue: true, status: true } },
};

/// The approved route on a requisition: the latest one approved.
export function approvedRouteOf(req: { approvalInstances: { status: string; value: { toString(): string } | null; ruleKey: string | null; ruleLabel: string | null; checkedAgainstMatrix: boolean }[] }): ApprovedRoute | null {
  const i = req.approvalInstances.find((x) => x.status === "APPROVED");
  if (!i) return null;
  return { value: routedValue(i), ruleKey: i.ruleKey, ruleLabel: i.ruleLabel, checkedAgainstMatrix: i.checkedAgainstMatrix };
}

export async function loadRequisitionForSourcing(id: string, client: Tx = db) {
  const org = await exerciseOrg(client);
  if (!org) return null;
  const req = await client.requisition.findFirst({ where: { id, organisationId: org.id }, include: requisitionInclude });
  if (!req) return null;
  return { org, req };
}

export type SourcingRequisition = NonNullable<Awaited<ReturnType<typeof loadRequisitionForSourcing>>>["req"];

export async function loadExercise(id: string, client: Tx = db) {
  const org = await exerciseOrg(client);
  if (!org) return null;
  const ex = await client.sourcingExercise.findFirst({ where: { id, organisationId: org.id }, include: exerciseInclude });
  if (!ex) return null;
  const req = await client.requisition.findUniqueOrThrow({ where: { id: ex.requisitionId }, include: requisitionInclude });
  return { org, ex, req };
}

export type LoadedExercise = NonNullable<Awaited<ReturnType<typeof loadExercise>>>;
export type ExerciseRow = LoadedExercise["ex"];

/// Lock the requisition, then (where given) the exercise, and re-read both.
export async function withLockedRequisitionForSourcing<T>(
  requisitionId: string,
  exerciseId: string | null,
  fn: (tx: Tx, l: { org: ExerciseOrg; req: SourcingRequisition; ex: ExerciseRow | null }) => Promise<T>,
): Promise<T | null> {
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Requisition" WHERE id = ${requisitionId} FOR UPDATE`;
      if (exerciseId) await tx.$queryRaw`SELECT id FROM "SourcingExercise" WHERE id = ${exerciseId} FOR UPDATE`;
      const r = await loadRequisitionForSourcing(requisitionId, tx);
      if (!r) return null;
      let ex: ExerciseRow | null = null;
      if (exerciseId) {
        const l = await loadExercise(exerciseId, tx);
        if (!l || l.ex.requisitionId !== requisitionId) return null;
        ex = l.ex;
      }
      return fn(tx, { org: r.org, req: r.req, ex });
    },
    { timeout: 20_000, maxWait: 10_000 },
  );
}

/// The exercise's requisition id, read without a lock, to know what to lock.
export async function requisitionOfExercise(exerciseId: string): Promise<string | null> {
  const ex = await db.sourcingExercise.findUnique({ where: { id: exerciseId }, select: { requisitionId: true } });
  return ex?.requisitionId ?? null;
}

/**
 * Everything an evaluation reads for one requisition on one day: the issue in force
 * and its terms, the funder's rule set where the requisition's route supersedes, the
 * configuration, the approved route and the sibling exercises. Read inside the write's
 * transaction when there is one.
 */
export async function evaluationContext(
  org: ExerciseOrg,
  req: SourcingRequisition,
  ex: { id: string; classificationLockedAt: Date | null; contractTypeCode: string | null; taxonomyValues: { taxonomyCode: string; valueCode: string; pick: "DERIVED" | "CHOSEN" }[] } | null,
  client: Tx = db,
) {
  const on = org.today ? dayToDate(org.today) : new Date();
  const [issue, cfg, route] = await Promise.all([
    loadBandIssue(on, client),
    loadMethodConfig(org.id, client),
    req.fundingRouteCode ? client.fundingRoute.findFirst({ where: { organisationId: org.id, code: req.fundingRouteCode } }) : Promise.resolve(null),
  ]);
  if (!issue) return { issue: null, cfg, ctx: null, on };
  const supersedes = req.fundingSupersedesAuthority === true;
  const override = supersedes && req.fundingRouteCode ? await loadOverrideMatrix(ORGANISATION_CODE, req.fundingRouteCode, on, client) : null;
  const funder: FunderContext = { dal: issue.matrix, override, supersedes };
  // The posture as snapshotted on the requisition at submission, else the route's now.
  const posture = (req.fundingPosture as EvaluationContext["posture"]) ?? (route ? fundingPosture({ ...route, provenance: route.provenance as Provenance }) : null);
  const siblings = await client.sourcingExercise.findMany({ where: { requisitionId: req.id }, select: { id: true, estimatedValue: true, status: true } });
  // The exercise's dossier evidence and scope document, counted by the document store.
  const evidence = ex ? exerciseEvidence(await attachmentFacts({ kind: "exercise", id: ex.id }, client, ["DOSSIER_EVIDENCE", "COORDINATION_SCOPE"])) : NO_EVIDENCE;
  const ctx: EvaluationContext = {
    funder,
    termsBands: issue.terms,
    boundaryProvenance: issue.boundaryProvenance,
    posture,
    on,
    config: cfg.config,
    approved: approvedRouteOf(req),
    siblings: siblings.map((s) => ({ id: s.id, value: parseSen(s.estimatedValue.toString()), status: s.status as ExerciseStatus })),
    lockedAt: ex?.classificationLockedAt ?? null,
    currentTypeCode: ex?.contractTypeCode ?? null,
    picks: ex?.taxonomyValues ?? [],
    evidence,
  };
  return { issue, cfg, ctx, on };
}

export const EXERCISES_PAGE = 100;

export async function listExercises() {
  const org = await exerciseOrg();
  if (!org) return { org: null, rows: [], total: 0 };
  const where = { organisationId: org.id };
  const [rows, total] = await Promise.all([
    db.sourcingExercise.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { reference: "desc" }],
      take: EXERCISES_PAGE,
      include: {
        requisition: { select: { id: true, reference: true, erpRequisitionNo: true } },
        approvalInstances: { where: EXERCISE_ROUTES_WHERE, select: { status: true, openedAt: true, domain: true, awardId: true } },
      },
    }),
    db.sourcingExercise.count({ where }),
  ]);
  return { org, rows, total };
}

export const HISTORY_PAGE = 200;

/// The audit trail of an exercise and everything under it, newest first.
export async function exerciseHistory(l: LoadedExercise) {
  const ex = l.ex;
  const ids = [
    ex.id,
    ...ex.scopeParts.map((x) => x.id),
    ...ex.proposalAnswers.map((x) => x.id),
    ...ex.taxonomyValues.map((x) => x.id),
    ...ex.participants.map((x) => x.id),
    ...ex.approvalInstances.flatMap((i) => [i.id, ...i.steps.map((s) => s.id)]),
  ];
  const where = { organisationId: l.org.id, OR: [{ entityId: { in: ids } }, { entityLabel: { startsWith: `${ex.reference} ·` } }] };
  const [rows, total] = await Promise.all([db.auditEntry.findMany({ where, orderBy: { at: "desc" }, take: HISTORY_PAGE }), db.auditEntry.count({ where })]);
  return {
    total,
    entries: rows.map((e) => ({
      id: e.id,
      entity: e.entity,
      entityId: e.entityId,
      entityLabel: e.entityLabel,
      action: e.action,
      at: e.at,
      reason: e.reason,
      // 6.2: an estimate version's figure or reason reads "Sealed (version N)", whatever the row holds (ADR 0012).
      changes: ((e.changes ?? []) as unknown as { field: string; before: string | null; after: string | null }[]).map((c) => historyChange(e.entity, c, versionInLabel(e.entityLabel))),
    })),
  };
}

const versionInLabel = (label: string) => {
  const m = /version (\d+)$/.exec(label);
  return m ? Number(m[1]) : null;
};

/// A stored exercise as the evaluator reads a draft.
export function draftOf(ex: ExerciseRow): ExerciseDraft {
  return {
    id: ex.id,
    value: parseSen(ex.estimatedValue.toString()),
    methodCode: ex.sourcingMethodCode || null,
    methodReason: ex.methodReason,
    externalRouteNote: ex.externalRouteNote,
    parentContractRef: ex.parentContractRef,
    scope: ex.scopeParts.map((p) => ({ kind: p.deliverableKind as DeliverableKind, amount: parseSen(p.amount.toString()), description: p.description })),
    contractTypeCode: ex.contractTypeState === "DERIVED" ? null : ex.contractTypeCode,
    typeReason: ex.contractTypeOverrideReason,
    typePersonId: ex.overriddenByPersonId,
    basisCode: ex.contractBasisCode,
    justificationReasonCode: ex.justificationReasonCode,
    justificationText: ex.justificationText,
    evidenceNote: ex.evidenceNote,
    dossierReference: ex.dossierReference,
    emergencyTrigger: ex.emergencyTrigger,
    coordinationMeetingOn: ex.coordinationMeetingOn ? storedDay(ex.coordinationMeetingOn) : null,
  };
}

