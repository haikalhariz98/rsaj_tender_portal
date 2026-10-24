/**
 * Sourcing exercises and their configuration, loaded. Reads only; every rule is in the
 * pure modules beside this. `withLockedExercise` is how every write reads: it locks the
 * parent requisition's row, then the exercise's, and re-reads both inside the write's
 * own transaction, so a sibling-sum check and the write it guards see the same data.
 */

import type { Prisma } from "@/generated/prisma/client";
import { LIST_EXPORT_MAX_ROWS, listOrderBy, type ListQuery } from "@/lib/list-query";
import { wordsWhere } from "@/lib/search/words";
import { facetWhere, sourcingPhaseWhere } from "@/lib/insights/where";
import type { ExercisePhase } from "./phase";
import { isPublished } from "@/lib/window/phase";
import { SEALED_AUDIT_ENTITIES } from "@/lib/bids/online/audit-mask";
import { exerciseNotHidden, refuseHiddenExercise, type Reader } from "@/lib/auth/sulit-store";
import { routedValue } from "@/lib/approvals/routed-value";
import { exerciseEvidence, NO_EVIDENCE } from "@/lib/documents/evidence";
import { attachmentFacts } from "@/lib/documents/repo";
import type { Tx } from "@/lib/audit/record";
import { loadIssue, loadOverrideMatrix } from "@/lib/authority/load";
import { dayToDate, storedDay, todayIn } from "@/lib/dates";
import { db } from "@/lib/db";
import { parseSen } from "@/lib/money";
import type { Provenance } from "@/lib/reference/types";
import { fundingPosture } from "@/lib/reference/vocabulary";

import { historyChange } from "@/lib/scope/audit-view";

import { byValue } from "./bands";
import { EXERCISE_ROUTES_WHERE, type FunderContext } from "./approval";
import type { EvaluationContext, ExerciseDraft, MethodConfig } from "./evaluate";
import { classificationTaxonomies } from "./taxonomy";
import { EXERCISE_STATUSES, NAME_APPROVAL_DOMAIN, type ContractTypeRow, type DeliverableKind, type ExerciseStatus, type Method, type TermsBand } from "./types";
import type { ApprovedRoute } from "./value";
import { inOrder } from "@/lib/series";

const num = (v: { toString(): string } | null): number | null => (v == null ? null : Number(v.toString()));

/// The signed-in actor's organisation (ADR 0034 D10): its id, code, legal name, zone and today. Null when it no longer exists.
/// `name` is the legal name a printed record (a certificate, an award letter) names as its issuer: the organisation's own row, never the environment's.
export async function exerciseOrg(organisationId: string, client: Tx = db) {
  const org = await client.organisation.findUnique({ where: { id: organisationId }, select: { id: true, code: true, name: true, timeZone: true } });
  if (!org) return null;
  return { id: org.id, code: org.code, name: org.name, timeZone: org.timeZone, today: todayIn(new Date(), org.timeZone) };
}

export type ExerciseOrg = NonNullable<Awaited<ReturnType<typeof exerciseOrg>>>;

/// Methods with their behaviours and proposal items, and everything classification reads.
export async function loadMethodConfig(organisationId: string, client: Tx = db) {
  const where = { organisationId };
  const orderBy = [{ sortOrder: "asc" as const }, { nameEn: "asc" as const }];
  const [methods, reasons, types, bases, taxonomies, mappings, policy] = await inOrder(
    () => client.sourcingMethod.findMany({ where, orderBy, include: { checklistItems: { orderBy: { sortOrder: "asc" } } } }),
    () => client.justificationReason.findMany({ where, orderBy }),
    () => client.contractType.findMany({ where, orderBy }),
    () => client.contractBasis.findMany({ where, orderBy }),
    () => client.classificationTaxonomy.findMany({ where, orderBy, include: { values: { orderBy: { sortOrder: "asc" } } } }),
    () => client.taxonomyMapping.findMany({ where }),
    () => client.classificationPolicy.findUnique({ where }));
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

export async function loadTermsBands(authorityMatrixId: string, client: Tx = db): Promise<(TermsBand & { id: string; labelMs: string | null })[]> {
  // In value order (UX 13, BD-24), by the same rule the lib reads them in.
  const rows = await client.termsBand.findMany({ where: { authorityMatrixId } });
  return rows.map((t) => ({
    id: t.id,
    bandKey: t.bandKey,
    minValue: num(t.minValue),
    maxValue: num(t.maxValue),
    regime: t.regime,
    labelEn: t.labelEn,
    labelMs: t.labelMs,
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
export async function loadBandIssue(organisationCode: string, on: Date, client: Tx = db) {
  const issue = await loadIssue(organisationCode, on, undefined, null, client);
  if (!issue) return null;
  const [terms, meta] = await inOrder(
    () => loadTermsBands(issue.id, client),
    () => client.authorityMatrix.findUniqueOrThrow({ where: { id: issue.id }, select: { boundaryProvenance: true, boundarySource: true } }));
  return { ...issue, terms, boundaryProvenance: meta.boundaryProvenance as Provenance, boundarySource: meta.boundarySource };
}

const exerciseInclude = {
  scopeParts: { orderBy: { sortOrder: "asc" as const } },
  proposalAnswers: true,
  taxonomyValues: true,
  participants: { include: { person: { select: { id: true, name: true, isActive: true } } } },
  overriddenBy: { select: { id: true, name: true } },
  proposalReviewer: { select: { id: true, name: true } },
  // Founder, 2026-10-05: the person in charge, named on the Overview (isActive: a person since retired still reads, marked).
  personInCharge: { select: { id: true, name: true, isActive: true } },
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

export async function loadRequisitionForSourcing(organisationId: string, id: string, client: Tx = db) {
  const org = await exerciseOrg(organisationId, client);
  if (!org) return null;
  const req = await client.requisition.findFirst({ where: { id, organisationId: org.id }, include: requisitionInclude });
  if (!req) return null;
  return { org, req };
}

export type SourcingRequisition = NonNullable<Awaited<ReturnType<typeof loadRequisitionForSourcing>>>["req"];

export async function loadExercise(organisationId: string, id: string, client: Tx = db) {
  const org = await exerciseOrg(organisationId, client);
  if (!org) return null;
  const ex = await client.sourcingExercise.findFirst({ where: { id, organisationId: org.id }, include: exerciseInclude });
  if (!ex) return null;
  const req = await client.requisition.findUniqueOrThrow({ where: { id: ex.requisitionId }, include: requisitionInclude });
  return { org, ex, req };
}

export type LoadedExercise = NonNullable<Awaited<ReturnType<typeof loadExercise>>>;
export type ExerciseRow = LoadedExercise["ex"];

/**
 * Lock the requisition, then (where given) the exercise, and re-read both.
 *
 * Every write to an exercise, its window, its documents, its scope and its evaluation begins here, so this is where a restricted exercise is
 * refused (FR-MTD-007, Phase 3a): where the reader is not named on it the answer is `null`, "no longer exists", and the refusal is written to the
 * access log in this transaction (it commits, since nothing is thrown). The reader is the signed-in actor, never an organisation alone.
 */
export async function withLockedRequisitionForSourcing<T>(reader: Reader,
  requisitionId: string,
  exerciseId: string | null,
  fn: (tx: Tx, l: { org: ExerciseOrg; req: SourcingRequisition; ex: ExerciseRow | null }) => Promise<T>,
): Promise<T | null> {
  const organisationId = reader.organisationId;
  return db.$transaction(
    async (tx) => {
      if (exerciseId && (await refuseHiddenExercise(tx, reader, exerciseId))) return null;
      // Only the organisation's own rows are locked (ADR 0034 D10): another organisation's ids lock nothing and read as gone.
      await tx.$queryRaw`SELECT id FROM "Requisition" WHERE id = ${requisitionId} AND "organisationId" = ${organisationId} FOR UPDATE`;
      if (exerciseId) await tx.$queryRaw`SELECT id FROM "SourcingExercise" WHERE id = ${exerciseId} AND "organisationId" = ${organisationId} FOR UPDATE`;
      const r = await loadRequisitionForSourcing(organisationId, requisitionId, tx);
      if (!r) return null;
      let ex: ExerciseRow | null = null;
      if (exerciseId) {
        const l = await loadExercise(organisationId, exerciseId, tx);
        if (!l || l.ex.requisitionId !== requisitionId) return null;
        ex = l.ex;
      }
      return fn(tx, { org: r.org, req: r.req, ex });
    },
    { timeout: 20_000, maxWait: 10_000 },
  );
}

/// The exercise's requisition id, read without a lock, to know what to lock.
export async function requisitionOfExercise(organisationId: string, exerciseId: string): Promise<string | null> {
  const ex = await db.sourcingExercise.findFirst({ where: { id: exerciseId, organisationId }, select: { requisitionId: true } });
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
  const [issue, cfg, route] = await inOrder(
    () => loadBandIssue(org.code, on, client),
    () => loadMethodConfig(org.id, client),
    () => req.fundingRouteCode ? client.fundingRoute.findFirst({ where: { organisationId: org.id, code: req.fundingRouteCode } }) : Promise.resolve(null));
  if (!issue) return { issue: null, cfg, ctx: null, on };
  const supersedes = req.fundingSupersedesAuthority === true;
  const override = supersedes && req.fundingRouteCode ? await loadOverrideMatrix(org.code, req.fundingRouteCode, on, client) : null;
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

/// The list's own views (ST-8). The first five are a status set or a pending route and are answered by the database; `open`, `soon` and `boundary` are judged
/// (from stored instants and the reader's SULIT grant) by `judgedViewIds` in `src/app/sourcing/rows.ts`, over the candidates `exerciseCandidates` loads.
export const EXERCISE_VIEWS = ["drafts", "preparing", "approval", "published", "open", "soon", "name", "boundary"] as const;
export type ExerciseView = (typeof EXERCISE_VIEWS)[number];
export type JudgedView = "open" | "soon" | "boundary";
export const isJudgedView = (v: ExerciseView | null): v is JudgedView => v === "open" || v === "soon" || v === "boundary";

/// The statuses of a published exercise, from the one rule that says so.
export const PUBLISHED_STATUSES = EXERCISE_STATUSES.filter(isPublished);
/// A pending name-approval route (the same where the header's count uses).
const AWAITING_NAME = { status: { not: "CANCELLED" as const }, approvalInstances: { some: { awardId: null, domain: NAME_APPROVAL_DOMAIN, status: "PENDING" as const } } };

/// What a view adds to the where. The judged views get a superset (published, or on the boundary and not cancelled); `judgedViewIds` narrows it.
function viewWhere(view: ExerciseView | null): Prisma.SourcingExerciseWhereInput {
  switch (view) {
    case "drafts": return { status: "DRAFT" };
    case "preparing": return { status: "DOCUMENTS_IN_PREPARATION" };
    case "approval": return { status: "PENDING_APPROVAL_FOR_TENDERING" };
    case "published": case "open": case "soon": return { status: { in: PUBLISHED_STATUSES } };
    case "name": return AWAITING_NAME;
    case "boundary": return { onBoundary: true, status: { not: "CANCELLED" } };
    default: return {};
  }
}

/// The list's where: the organisation, the restricted exercises left out (FR-MTD-007), the search words and the view. Never a bare `onBoundary: true` for a count: see `exerciseListFacts`.
export const exerciseListWhere = (organisationId: string, hidden: readonly string[], q: Pick<ListQuery<ExerciseView>, "words" | "view" | "unit" | "method" | "stage">): Prisma.SourcingExerciseWhereInput => ({
  AND: [{ organisationId }, exerciseNotHidden(hidden), wordsWhere("exercise", q.words), viewWhere(q.view), facetWhere.exercise(q), stageWhere(q.stage)],
});

/// I-6: the dashboard's open-sourcing stage ("open" is the whole pipeline, as Home's Sourcing card counts it). An unknown stage word narrows nothing.
const STAGE_PHASE: Record<string, ExercisePhase | null> = { open: null, preparing: "PREPARING", in_market: "IN_MARKET", evaluating: "EVALUATING" };
const stageWhere = (stage: string | null): Prisma.SourcingExerciseWhereInput => (stage !== null && Object.hasOwn(STAGE_PHASE, stage) ? sourcingPhaseWhere(STAGE_PHASE[stage]) : {});

/// What the header reads, over the whole set and never the page (`hidden`: the restricted exercises the reader may not see, left out so neither the list nor its count gives away that one exists):
/// the count by status, the name approvals waiting, the not-cancelled exercises on the boundary (few, so all of them; the caller judges them for the reader), and the ids of the published ones, for the open and closing-soon counts.
export async function exerciseListFacts(organisationId: string, hidden: readonly string[]) {
  const org = await exerciseOrg(organisationId);
  if (!org) return { org: null, byStatus: new Map<string, number>(), awaitingName: 0, onBoundary: [] as { id: string; reference: string; estimatedValue: { toString(): string } }[], publishedIds: [] as string[] };
  const where = { organisationId: org.id, ...exerciseNotHidden(hidden) };
  const [statuses, awaitingName, onBoundary, published] = await Promise.all([
    db.sourcingExercise.groupBy({ by: ["status"], where, _count: { _all: true } }),
    db.sourcingExercise.count({ where: { ...where, ...AWAITING_NAME } }),
    db.sourcingExercise.findMany({ where: { ...where, onBoundary: true, status: { not: "CANCELLED" } }, select: { id: true, reference: true, estimatedValue: true } }),
    db.sourcingExercise.findMany({ where: { ...where, status: { in: PUBLISHED_STATUSES } }, select: { id: true } }),
  ]);
  return { org, byStatus: new Map(statuses.map((s) => [s.status as string, s._count._all])), awaitingName, onBoundary, publishedIds: published.map((p) => p.id) };
}

/// The candidates of a judged view under the search, in the list's order (ST-7), ids and what judging needs only. The judgement is not here.
export async function exerciseCandidates(organisationId: string, hidden: readonly string[], q: ListQuery<ExerciseView>) {
  return db.sourcingExercise.findMany({
    where: exerciseListWhere(organisationId, hidden, q),
    orderBy: listOrderBy("exercise", q),
    select: { id: true, reference: true, estimatedValue: true },
  });
}

/// One page of the list under the search and the view, ordered by `listOrderBy` (ST-7); a page past the end is the last. `total` is the count under the same where.
/// `ids`: for a judged view, the ids that passed the judgement in the order given (the candidates' order, so sort is set before paging); they are still read under the where, so the
/// organisation and the hidden exercises hold. With `{ all: true }` (the export): no skip, and `LIST_EXPORT_MAX_ROWS + 1` rows, to tell "over".
export async function listExercises(organisationId: string, hidden: readonly string[], q: ListQuery<ExerciseView>, opts: { ids?: readonly string[]; all?: boolean } = {}) {
  const org = await exerciseOrg(organisationId);
  if (!org) return { org: null, rows: [], total: 0, page: 0 };
  const where: Prisma.SourcingExerciseWhereInput = opts.ids ? { AND: [exerciseListWhere(org.id, hidden, q), { id: { in: [...opts.ids] } }] } : exerciseListWhere(org.id, hidden, q);
  const total = opts.ids ? opts.ids.length : await db.sourcingExercise.count({ where });
  const page = opts.all ? 0 : Math.min(q.page, Math.max(0, Math.ceil(total / q.size) - 1));
  const include = {
    requisition: { select: { id: true, reference: true, erpRequisitionNo: true } },
    approvalInstances: { where: EXERCISE_ROUTES_WHERE, select: { status: true, openedAt: true, domain: true, awardId: true } },
  };
  if (opts.ids) {
    const slice = opts.all ? opts.ids.slice(0, LIST_EXPORT_MAX_ROWS + 1) : opts.ids.slice(page * q.size, (page + 1) * q.size);
    const found = await db.sourcingExercise.findMany({ where: { AND: [where, { id: { in: [...slice] } }] }, include });
    const byId = new Map(found.map((r) => [r.id, r]));
    return { org, rows: slice.flatMap((id) => byId.get(id) ?? []), total, page };
  }
  const rows = await db.sourcingExercise.findMany({
    where,
    orderBy: listOrderBy("exercise", q),
    ...(opts.all ? { take: LIST_EXPORT_MAX_ROWS + 1 } : { skip: page * q.size, take: q.size }),
    include,
  });
  return { org, rows, total, page };
}

export const HISTORY_PAGE = 200;

/**
 * The audit trail of an exercise and everything under it, newest first.
 *
 * `withEntries` is false on every tab but History: the count is all the strip needs, and the rows (the opening's pairing of a listing number with a bidder's name and price, the
 * evaluation's audit rows, every SULIT value) belong to the History tab alone. The page used to build the panel on every tab, so its rows rode in the response of the Evaluation tab
 * of a team member read blind (product owner, 2026-10-08, ruling on log line 1751), and a workspace "reads one tab at a time". Off its own tab the entries are empty and nothing
 * that is judged from them (the custody of the disclosed estimate, the trail's SULIT gates) is asked, so nothing is logged for a History nobody opened.
 */
export async function exerciseHistory(l: LoadedExercise, withEntries = true) {
  const ex = l.ex;
  const ids = [
    ex.id,
    ...ex.scopeParts.map((x) => x.id),
    ...ex.proposalAnswers.map((x) => x.id),
    ...ex.taxonomyValues.map((x) => x.id),
    ...ex.participants.map((x) => x.id),
    ...ex.approvalInstances.flatMap((i) => [i.id, ...i.steps.map((s) => s.id)]),
  ];
  // Wave 3b (security audit 2, 20u): until the main opening has started, the rows of the online bids (their number, kinds and times are the counts, replacements and withdrawals Received hides) are
  // not in the History at all, so neither its rows nor its total show them. The same rule is held by `maskSealedAuditRows` for the export.
  const started = (await db.opening.count({ where: { exerciseId: ex.id, kind: "MAIN" } })) > 0;
  const where = { organisationId: l.org.id, OR: [{ entityId: { in: ids } }, { entityLabel: { startsWith: `${ex.reference} ·` } }], ...(started ? {} : { NOT: { entity: { in: [...SEALED_AUDIT_ENTITIES] } } }) };
  const [rows, total] = await Promise.all([withEntries ? db.auditEntry.findMany({ where, orderBy: { at: "desc" }, take: HISTORY_PAGE }) : Promise.resolve([]), db.auditEntry.count({ where })]);
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
      // 6.2: an estimate version's figure or reason reads "Withheld from view, held unencrypted (version N)", whatever the row holds (ADR 0012, ruling 20cw (b)).
      changes: ((e.changes ?? []) as unknown as { field: string; before: string | null; after: string | null }[]).map((c) => historyChange(e.entity, c, versionInLabel(e.entityLabel))),
    })),
  };
}

/// The day an exercise was cancelled, from its own trail: the one fact of the History the Overview shows. A cancelled exercise is read for it directly, so the rows themselves stay on the History tab.
export async function exerciseCancelledAt(l: LoadedExercise): Promise<Date | null> {
  const rows = await db.auditEntry.findMany({ where: { organisationId: l.org.id, entity: "SourcingExercise", entityId: l.ex.id, action: "UPDATE" }, orderBy: { at: "desc" }, take: 50, select: { at: true, changes: true } });
  const hit = rows.find((e) => ((e.changes ?? []) as unknown as { field: string; after: string | null }[]).some((c) => c.field === "status" && c.after === "CANCELLED"));
  return hit?.at ?? null;
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

