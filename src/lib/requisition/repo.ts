/**
 * Requisitions, loaded. Reads only; every rule is in the pure modules beside this.
 * `withLockedRequisition` is how every write reads: it locks the requisition's row and
 * re-reads it inside the write's own transaction, so a check and the write it guards
 * see the same data (the pattern 6.10's sittings use).
 */

import { liveAttachmentWhere } from "@/lib/documents/repo";
import type { Tx } from "@/lib/audit/record";
import type { Prisma, RequisitionStatus } from "@/generated/prisma/client";
import { LIST_EXPORT_MAX_ROWS, listOrderBy, type ListQuery } from "@/lib/list-query";
import { wordsWhere } from "@/lib/search/words";
import { REQUISITION_PIPELINE } from "@/lib/dashboard/pipeline";
import { facetWhere, insightsWhere, requisitionApprovedAny } from "@/lib/insights/where";
import type { BudgetCode as PureBudgetCode } from "@/lib/budget/codes";
import { decisionRecord, type DecisionRecord } from "@/lib/committee/record";
import { isRegisterSnapshot } from "@/lib/committee/assess-sitting";
import { dayToDate, todayIn } from "@/lib/dates";
import { amountOf, senFromDecimal } from "@/lib/money";
import { db } from "@/lib/db";
import type { CodeFormat, OrgUnit, OrgUnitKind } from "@/lib/organisation/types";
import type { FundingRouteRow } from "@/lib/requisition/funding";
import type { Lookups, RequisitionDraft } from "@/lib/requisition/fields";
import { sentBackBy } from "@/lib/requisition/sent-back";
import { gateFinding, gatesFor, gateState, type GateFinding, type GateMatter, type GateRuleRow, type GateState } from "@/lib/requisition/gate";
import { UNSET_POLICY, type Provenance, type RequisitionPolicy } from "@/lib/requisition/types";
import type { AuditActor } from "@/lib/auth/types";
import { inOrder } from "@/lib/series";

export const num = (v: { toString(): string } | null | undefined): number | null => (v == null ? null : amountOf(v));

/// The signed-in actor's organisation (ADR 0034 D10): its id, code, zone and today (null while no zone is set).
export async function requisitionOrg(organisationId: string, client: Tx = db) {
  const org = await client.organisation.findUnique({ where: { id: organisationId }, select: { id: true, code: true, timeZone: true } });
  if (!org) return null;
  return { id: org.id, code: org.code, timeZone: org.timeZone, today: todayIn(new Date(), org.timeZone) };
}

export async function loadPolicy(organisationId: string, client: Tx = db): Promise<RequisitionPolicy & { id: string | null; notes: string }> {
  const row = await client.requisitionPolicy.findUnique({ where: { organisationId } });
  if (!row) return { ...UNSET_POLICY, id: null, notes: "" };
  return {
    id: row.id,
    notes: row.notes,
    budgetRecheckDays: row.budgetRecheckDays,
    endorsementTiers: row.endorsementTiers as OrgUnitKind[],
    provenance: (row.provenance as Provenance | null) ?? null,
  };
}

/// The settings a requisition reads from other screens: budget and finance.
export async function loadControls(organisationId: string, client: Tx = db) {
  const [budget, finance] = await inOrder(
    () => client.budgetSettings.findUnique({ where: { organisationId } }),
    () => client.financeIntegration.findUnique({ where: { organisationId } }));
  return {
    availabilityCheck: budget?.availabilityCheck ?? null,
    commitOnApproval: budget?.commitOnApproval ?? null,
    budgetCheckSource: finance?.budgetCheckSource ?? null,
  };
}

/// The lists a requisition's fields are looked up against, and the code formats.
export async function loadLookups(organisationId: string, client: Tx = db) {
  const where = { organisationId };
  const [units, costCentres, accountCodes, sites, budgetCodes, people, fundingRoutes, formats, contractTypes] = await inOrder(
    () => client.orgUnit.findMany({ where, orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }] }),
    () => client.costCentre.findMany({ where, orderBy: [{ sortOrder: "asc" }, { code: "asc" }] }),
    () => client.accountCode.findMany({ where, orderBy: [{ sortOrder: "asc" }, { code: "asc" }] }),
    () => client.site.findMany({ where, orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }] }),
    () => client.budgetCode.findMany({ where, orderBy: { code: "asc" } }),
    () => client.person.findMany({ where, orderBy: { name: "asc" }, select: { id: true, name: true, isActive: true, jobTitle: true, orgUnitCode: true } }),
    () => client.fundingRoute.findMany({ where, orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }] }),
    () => client.codeFormat.findMany({ where }),
    () => client.contractType.findMany({ where, orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }] }));
  const lookups: LoadedLookups = {
    units: units.map((u) => ({ ...u, kind: u.kind as OrgUnitKind, provenance: u.provenance as Provenance })),
    costCentres,
    accountCodes,
    sites,
    budgetCodes,
    people,
    fundingRoutes: fundingRoutes.map((r) => ({ ...r, provenance: r.provenance as Provenance })),
    contractTypes,
  };
  return {
    lookups,
    costCentres,
    accountCodes,
    sites,
    contractTypes,
    formats: formats.map((f) => ({ ...f, provenance: f.provenance as Provenance })) as CodeFormat[],
  };
}

export type LoadedLookups = Omit<Lookups, "units" | "budgetCodes" | "people" | "fundingRoutes"> & {
  units: (OrgUnit & { id: string })[];
  budgetCodes: (PureBudgetCode & { code: string })[];
  people: { id: string; name: string; isActive: boolean; jobTitle: string | null; orgUnitCode: string | null }[];
  fundingRoutes: FundingRouteRow[];
};

const include = {
  requestingPerson: { select: { id: true, name: true } },
  returnedTo: { select: { id: true, name: true } },
  budgetCode: { select: { id: true, code: true, descriptionEn: true, owningUnitCode: true, accountCode: true } },
  lines: { orderBy: { lineNo: "asc" as const } },
  endorsements: { include: { person: { select: { id: true, name: true } } }, orderBy: { endorsedOn: "asc" as const } },
  budgetChecks: { orderBy: { checkedAt: "desc" as const } },
  splitChecks: { orderBy: { checkedAt: "desc" as const }, include: { overriddenBy: { select: { name: true } } } },
  approvalInstances: {
    orderBy: [{ openedAt: "desc" as const }, { createdAt: "desc" as const }, { id: "desc" as const }],
    include: {
      rejectionChosenBy: { select: { name: true } },
      steps: {
        orderBy: { sequence: "asc" as const },
        include: {
          declaredBy: { select: { name: true } },
          delegation: { select: { id: true, valueCeiling: true, fromPerson: { select: { name: true } } } },
          committeeDecision: {
            include: { meeting: { include: { committee: { select: { nameEn: true, code: true } } } }, votes: { include: { person: { select: { name: true } } } } },
          },
        },
      },
    },
  },
  committeeDecisions: {
    include: {
      meeting: { include: { committee: { select: { nameEn: true, code: true, carriedLabelEn: true } } } },
      votes: { include: { person: { select: { name: true } } } },
      approvalStep: { select: { id: true } },
    },
    orderBy: { tabledAt: "desc" as const },
  },
  // The committee gates (FR-REQ-012) and the matters cited against each.
  gates: {
    orderBy: { committeeLabel: "asc" as const },
    include: {
      decisions: {
        include: {
          // The sitting's signed minutes, as the document store defines attached (FR-REQ-012 gate card).
          meeting: { include: { committee: { select: { nameEn: true, code: true, carriedLabelEn: true } }, attachments: { where: liveAttachmentWhere("SIGNED_MINUTES"), select: { id: true } } } },
          votes: { include: { person: { select: { name: true } } } },
        },
      },
    },
  },
};

export async function loadRequisition(organisationId: string, id: string, client: Tx = db) {
  const org = await requisitionOrg(organisationId, client);
  if (!org) return null;
  const req = await client.requisition.findFirst({ where: { id, organisationId: org.id }, include });
  if (!req) return null;
  return { org, req };
}

export type LoadedRequisition = NonNullable<Awaited<ReturnType<typeof loadRequisition>>>;
export type RequisitionRow = LoadedRequisition["req"];

/**
 * The decision record of a committee matter, as 6.10 cites it: from the minuted
 * sitting's snapshot of its committee's name where there is one.
 */
/// The fields of a committee matter its decision record is built from.
export interface DecisionRow {
  subject: string;
  matterRef: string | null;
  outcome: "PENDING" | "CARRIED" | "NOT_CARRIED" | "DEFERRED";
  decisionDate: Date | null;
  quorumRequired: number | null;
  presentVoters: number | null;
  recusedCount: number | null;
  votingRule: "SIMPLE_MAJORITY" | "UNANIMOUS" | null;
  votingRuleProvenance: string | null;
  outcomeNote: string;
  notApprovedOutcomeNameEn: string | null;
  notApprovedOutcomeKind: "LOOP" | "TERMINAL" | null;
  meeting: { reference: string; meetingDate: Date; status: string; registerSnapshot: unknown; committee: { nameEn: string } };
  votes: { person: { name: string }; choice: string; comment: string; votedAt: Date }[];
}

export function recordOf(d: DecisionRow): DecisionRecord | null {
  const snap = d.meeting.status === "MINUTED" && isRegisterSnapshot(d.meeting.registerSnapshot) ? d.meeting.registerSnapshot : null;
  return decisionRecord({
    meeting: { reference: d.meeting.reference, meetingDate: d.meeting.meetingDate, committeeName: snap?.committeeName ?? d.meeting.committee.nameEn },
    decision: {
      subject: d.subject,
      matterRef: d.matterRef,
      outcome: d.outcome,
      decisionDate: d.decisionDate,
      quorumRequired: d.quorumRequired,
      presentVoters: d.presentVoters,
      recusedCount: d.recusedCount,
      votingRule: d.votingRule,
      votingRuleProvenance: d.votingRuleProvenance,
      outcomeNote: d.outcomeNote,
      notApprovedOutcomeNameEn: d.notApprovedOutcomeNameEn,
      notApprovedOutcomeKind: d.notApprovedOutcomeKind,
    },
    votes: d.votes.map((v) => ({ name: v.person.name, choice: v.choice, comment: v.comment, votedAt: v.votedAt })),
  });
}

/**
 * Run a write against a requisition with its row locked. Returns null when it does
 * not exist. Configuration read inside is read in the same transaction.
 */
export async function withLockedRequisition<T>(organisationId: string, id: string, fn: (tx: Tx, l: LoadedRequisition) => Promise<T>): Promise<T | null> {
  return db.$transaction(
    async (tx) => {
      // Only the organisation's own row is locked (ADR 0034 D10): another organisation's id locks nothing and reads as gone.
      await tx.$queryRaw`SELECT id FROM "Requisition" WHERE id = ${id} AND "organisationId" = ${organisationId} FOR UPDATE`;
      const l = await loadRequisition(organisationId, id, tx);
      if (!l) return null;
      return fn(tx, l);
    },
    { timeout: 20_000, maxWait: 10_000 },
  );
}

/// The list's own views (ST-8 does not touch these: each is a status set), and the statuses each one holds.
export const REQUISITION_VIEWS = ["pending", "drafts", "over", "pipeline"] as const;
export type RequisitionView = (typeof REQUISITION_VIEWS)[number];
const VIEW_STATUSES: Record<RequisitionView, readonly RequisitionStatus[]> = { pending: ["PENDING_APPROVAL"], drafts: ["DRAFT", "RETURNED", "RECALLED"], over: ["OVER_BUDGET"], pipeline: REQUISITION_PIPELINE };

/// I-6: the dashboard's facets, from its own where-builders. A day range is "raised in the range"; stage "approved" narrows it to those whose route was approved.
function facetsWhere(organisationId: string, q: Pick<ListQuery<RequisitionView>, "unit" | "route" | "method" | "stage" | "from" | "to">): Prisma.RequisitionWhereInput {
  if (q.from && q.to) return (q.stage === "approved" ? insightsWhere.requisitionsApproved : insightsWhere.requisitionsRaised)(organisationId, q, { from: q.from, to: q.to });
  return { ...facetWhere.requisition(q), ...(q.stage === "approved" ? requisitionApprovedAny : {}) };
}

/// The list's where for a query: the organisation, the search words, the view's status set and the dashboard's facets, all ANDed.
export const requisitionListWhere = (organisationId: string, q: Pick<ListQuery<RequisitionView>, "words" | "view" | "unit" | "route" | "method" | "stage" | "from" | "to">): Prisma.RequisitionWhereInput => ({
  AND: [{ organisationId }, wordsWhere("requisition", q.words), q.view ? { status: { in: [...VIEW_STATUSES[q.view]] } } : {}, facetsWhere(organisationId, q)],
});

/// The organisation's requisitions for the list: one page of `q.size` (a page past the end is the last), ordered by `listOrderBy` (ST-7), under the search and the view.
/// `total` is the count under the same where. With `{ all: true }` (the export): no skip, and `LIST_EXPORT_MAX_ROWS + 1` rows, to tell "over".
export async function listRequisitions(organisationId: string, q: ListQuery<RequisitionView>, opts: { all?: boolean } = {}) {
  const org = await requisitionOrg(organisationId);
  if (!org) return { org: null, rows: [], total: 0, page: 0, counts: { open: 0, pending: 0, overBudget: 0, flagged: 0, drafts: 0 } };
  const where = requisitionListWhere(org.id, q);
  const total = await db.requisition.count({ where });
  const page = opts.all ? 0 : Math.min(q.page, Math.max(0, Math.ceil(total / q.size) - 1));
  const orgWhere = { organisationId: org.id };
  // The chips count under the list's own facets (I-6), never its search or view, so a chip's number is its view's total.
  const chip = (w: Prisma.RequisitionWhereInput): Prisma.RequisitionWhereInput => ({ AND: [orgWhere, facetsWhere(org.id, q), w] });
  const [rows, routes, units] = await Promise.all([
    db.requisition.findMany({
      where,
      orderBy: listOrderBy("requisition", q),
      ...(opts.all ? { take: LIST_EXPORT_MAX_ROWS + 1 } : { skip: page * q.size, take: q.size }),
      include: {
        requestingPerson: { select: { name: true } },
        budgetChecks: { orderBy: { checkedAt: "desc" }, take: 1, select: { verdict: true } },
        splitChecks: { orderBy: { checkedAt: "desc" }, take: 1, select: { state: true, overrideJustification: true } },
        // Every route, for whether a draft was sent back: a rejected route is a small row.
        approvalInstances: { select: { status: true, openedAt: true, closedAt: true, rejectionApplied: true, rejectionReason: true } },
      },
    }),
    db.fundingRoute.findMany({ where: orgWhere, select: { code: true, nameEn: true } }),
    db.orgUnit.findMany({ where: orgWhere, select: { code: true, nameEn: true, effectiveFrom: true }, orderBy: { effectiveFrom: "desc" } }),
  ]);
  const [open, pending, overBudget, flagged, drafts] = await Promise.all([
    db.requisition.count({ where: chip({ status: { notIn: ["CANCELLED", "CLOSED", "APPROVED", "SOURCING", "PARTIALLY_FULFILLED", "FULFILLED"] } }) }),
    db.requisition.count({ where: chip({ status: "PENDING_APPROVAL" }) }),
    // Open, and over budget on its latest check — whether or not it has gone on to the
    // over-budget approvers.
    db.requisition
      .findMany({
        where: chip({ status: { in: ["REGISTERED", "BUDGET_CHECKED", "OVER_BUDGET", "PENDING_APPROVAL"] } }),
        select: { budgetChecks: { orderBy: { checkedAt: "desc" }, take: 1, select: { verdict: true } } },
      })
      .then((xs) => xs.filter((x) => x.budgetChecks[0]?.verdict === "EXCEEDS").length),
    db.requisition.count({
      where: chip({ status: { notIn: ["CANCELLED", "CLOSED"] }, splitChecks: { some: { state: "FLAGGED", overrideJustification: null } } }),
    }),
    db.requisition.count({ where: chip({ status: { in: [...VIEW_STATUSES.drafts] } }) }),
  ]);
  const unitName = new Map<string, string>();
  for (const u of units) if (!unitName.has(u.code)) unitName.set(u.code, u.nameEn);
  return {
    org,
    rows: rows.map((r) => ({
      ...r,
      estimatedValue: num(r.estimatedValue)!,
      unitName: unitName.get(r.requestingUnitCode) ?? "A unit no longer configured",
      requesterName: r.requestingPerson.name,
      routeName: r.fundingRouteCode ? (routes.find((x) => x.code === r.fundingRouteCode)?.nameEn ?? "A route no longer configured") : null,
      verdict: r.budgetChecks[0]?.verdict ?? null,
      split: r.splitChecks[0] ?? null,
      sentBack: sentBackBy(r.status, r.approvalInstances, r.returnedOn),
    })),
    total,
    page,
    counts: { open, pending, overBudget, flagged, drafts },
  };
}

export const HISTORY_PAGE = 200;

/// The audit trail of a requisition and everything under it, newest first.
export async function requisitionHistory(l: LoadedRequisition) {
  const r = l.req;
  const ids = [
    r.id,
    ...r.endorsements.map((e) => e.id),
    ...r.budgetChecks.map((c) => c.id),
    ...r.splitChecks.map((c) => c.id),
    ...r.approvalInstances.flatMap((i) => [i.id, ...i.steps.map((s) => s.id)]),
  ];
  const where = { organisationId: l.org.id, entityId: { in: ids } };
  const [rows, total] = await Promise.all([
    db.auditEntry.findMany({ where, orderBy: { at: "desc" }, take: HISTORY_PAGE }),
    db.auditEntry.count({ where }),
  ]);
  return {
    total,
    entries: rows.map((e) => ({
      id: e.id,
      entity: e.entity,
      entityLabel: e.entityLabel,
      action: e.action,
      at: e.at,
      reason: e.reason,
      changes: (e.changes ?? []) as unknown as { field: string; before: string | null; after: string | null }[],
    })),
  };
}

/// A stored requisition as the pure field rules read a draft.
export function draftOf(req: RequisitionRow): RequisitionDraft {
  const day = (d: Date) => d.toISOString().slice(0, 10);
  return {
    title: req.title,
    justification: req.justification,
    needStatement: req.needStatement,
    requestingUnitCode: req.requestingUnitCode || null,
    sectionUnitCode: req.sectionUnitCode,
    requestingPersonId: req.requestingPersonId,
    costCentreCode: req.costCentreCode || null,
    accountCode: req.accountCode || null,
    budgetCodeId: req.budgetCodeId,
    siteCode: req.siteCode,
    placeOfDelivery: req.placeOfDelivery,
    dateRequired: day(req.dateRequired),
    estimatedValue: req.estimatedValue.toString(),
    fundingRouteCode: req.fundingRouteCode,
    contractTypeCode: req.contractTypeCode,
    lines: req.lines.map((x) => ({
      description: x.description,
      quantity: x.quantity?.toString() ?? null,
      unit: x.unit,
      estimatedUnitPrice: x.estimatedUnitPrice?.toString() ?? null,
      estimatedAmount: x.estimatedAmount.toString(),
    })),
  };
}

/// The choices the requisition form offers, in force on `on`. Units by name; business
/// codes (cost centre, account, budget code) with their names.
export async function formOptions(organisationId: string, on: Date) {
  const { lookups, costCentres, accountCodes, sites, contractTypes } = await loadLookups(organisationId);
  const inForce = <T extends { effectiveFrom: Date; effectiveTo: Date | null }>(x: T) => x.effectiveFrom <= on && (x.effectiveTo == null || x.effectiveTo > on);
  const units = lookups.units.filter(inForce);
  return {
    // What the officer's defaults read: the units in force, with their kind and parent.
    units: units.map((u) => ({ code: u.code, kind: u.kind, parentCode: u.parentCode })),
    departments: units.filter((u) => u.kind === "DEPARTMENT").map((u) => ({ code: u.code, name: u.nameEn })),
    sections: units.filter((u) => u.kind === "SECTION").map((u) => ({ code: u.code, name: u.nameEn, parentCode: u.parentCode })),
    people: lookups.people.filter((p) => p.isActive).map((p) => ({ id: p.id, name: p.name, orgUnitCode: p.orgUnitCode })),
    costCentres: costCentres.filter(inForce).map((c) => ({ code: c.code, name: c.nameEn, orgUnitCode: c.orgUnitCode })),
    accounts: accountCodes.filter(inForce).map((a) => ({ code: a.code, name: a.nameEn })),
    budgetCodes: lookups.budgetCodes.filter((b) => b.isActive && inForce(b)).map((b) => ({ id: b.id, code: b.code, name: b.descriptionEn, accountCode: b.accountCode })),
    sites: sites.filter(inForce).map((x) => ({ code: x.code, name: x.nameEn })),
    fundingRoutes: lookups.fundingRoutes.filter((r) => r.retiredOn == null || r.retiredOn > on).map((r) => ({ code: r.code, name: r.nameEn })),
    contractTypes: contractTypes.filter((c) => c.retiredOn == null || c.retiredOn > on).map((c) => ({ code: c.code, name: c.nameEn })),
  };
}

/**
 * Link committee matters tabled as requisition matters before the requisition could be
 * found by their reference (ADR 0002 backfill): when a requisition is received or its
 * finance-system numbers recorded, an unlinked matter whose reference now names exactly
 * this requisition is linked, audited. A reference that answers to more than one
 * requisition is left alone. Returns how many were linked.
 */
export async function linkMatchingMatters(tx: Tx, actor: AuditActor, organisationId: string, requisitionId: string): Promise<number> {
  const req = await tx.requisition.findUnique({ where: { id: requisitionId }, select: { reference: true, erpRequisitionNo: true, erpNoteNo: true, status: true } });
  if (!req) return 0;
  const refs = [req.reference, req.erpRequisitionNo, req.erpNoteNo].filter((x): x is string => !!x);
  const matters = await tx.committeeDecision.findMany({
    where: { matterKind: "REQUISITION", requisitionId: null, matterRef: { in: refs }, meeting: { committee: { organisationId } } },
    select: { id: true, matterRef: true, subject: true },
  });
  const { resolveMatterRef } = await import("./matter-link");
  const { writeAudit } = await import("@/lib/audit/record");
  let linked = 0;
  for (const m of matters) {
    const matches = await tx.requisition.findMany({
      where: { organisationId, OR: [{ reference: m.matterRef! }, { erpRequisitionNo: m.matterRef! }, { erpNoteNo: m.matterRef! }] },
      select: { id: true, status: true },
      take: 2,
    });
    const r = resolveMatterRef(matches);
    if (!r.ok || r.requisitionId !== requisitionId) continue;
    await tx.committeeDecision.update({ where: { id: m.id }, data: { requisitionId } });
    await writeAudit(
      tx,
      { actor, organisationId, entity: "CommitteeDecision", entityId: m.id, entityLabel: m.subject, reason: `Linked to requisition ${req.reference} by its reference` },
      "UPDATE",
      [{ field: "requisition", before: null, after: req.reference }],
    );
    linked++;
  }
  return linked;
}

/// The gate rules of an organisation, as the pure check reads them.
export async function loadGateRules(organisationId: string, client: Tx = db): Promise<GateRuleRow[]> {
  const rows = await client.committeeGateRule.findMany({ where: { organisationId }, orderBy: [{ sortOrder: "asc" }, { effectiveFrom: "asc" }] });
  return rows.map((r) => ({ ...r, act: r.act as string, aboveValue: r.aboveValue?.toString() ?? null, provenance: r.provenance as Provenance }));
}

/// A gate's matters, as `gateState` reads them: from `decisionRecord()` only.
export function gateMattersOf(gate: LoadedRequisition["req"]["gates"][number]): GateMatter[] {
  return gate.decisions.map((d) => ({ id: d.id, tabledAt: d.tabledAt, withdrawn: d.withdrawnAt != null, record: recordOf(d), sittingReference: d.meeting.reference }));
}

/**
 * Where every gate of a requisition stands, and what that says about opening an
 * exercise (ruling C2). Undetermined is never clear: why it is undetermined is read
 * from the route's setting and rules as they stand now, so the blocker names what to
 * set. Read inside the caller's transaction where it guards a write.
 */
export async function gatesForRequisition(requisitionId: string, client: Tx = db) {
  const req = await client.requisition.findUnique({ where: { id: requisitionId }, select: GATE_REQUISITION });
  if (!req) return null;
  const open = !req.gatesDeterminedOn;
  const route = open && req.fundingRouteCode ? await client.fundingRoute.findFirst({ where: { organisationId: req.organisationId, code: req.fundingRouteCode }, select: GATE_ROUTE }) : null;
  return gateViewOf(req, route, open ? await loadGateRules(req.organisationId, client) : []);
}

/// `gatesForRequisition` for many requisitions of one organisation at once: the gates in one query, and the routes and rules read once, not for each. A requisition that is not found is absent from the map.
export async function gatesForRequisitions(organisationId: string, ids: readonly string[], client: Tx = db) {
  const out = new Map<string, NonNullable<Awaited<ReturnType<typeof gatesForRequisition>>>>();
  if (ids.length === 0) return out;
  const reqs = await client.requisition.findMany({ where: { id: { in: [...ids] }, organisationId }, select: GATE_REQUISITION });
  const open = reqs.some((r) => !r.gatesDeterminedOn);
  const [routes, rules] = await Promise.all([open ? client.fundingRoute.findMany({ where: { organisationId }, select: GATE_ROUTE }) : [], open ? loadGateRules(organisationId, client) : []]);
  for (const r of reqs) out.set(r.id, gateViewOf(r, r.gatesDeterminedOn ? null : (routes.find((x) => x.code === r.fundingRouteCode) ?? null), rules));
  return out;
}

const GATE_ROUTE = { code: true, committeeGateRequired: true } as const;
const GATE_REQUISITION = {
  id: true,
  organisationId: true,
  fundingRouteCode: true,
  gatesDeterminedOn: true,
  estimatedValue: true,
  organisation: { select: { timeZone: true } },
  approvalInstances: { where: { status: "APPROVED" }, select: { value: true }, take: 1 },
  gates: { orderBy: { committeeLabel: "asc" }, include: { decisions: { include: { meeting: { include: { committee: { select: { nameEn: true } } } }, votes: { include: { person: { select: { name: true } } } } } } } },
} satisfies Prisma.RequisitionSelect;

function gateViewOf(req: Prisma.RequisitionGetPayload<{ select: typeof GATE_REQUISITION }>, route: Prisma.FundingRouteGetPayload<{ select: typeof GATE_ROUTE }> | null, rules: GateRuleRow[]): { gates: { id: string; committeeLabel: string; state: GateState; decisive: GateMatter | null }[]; finding: GateFinding } {
  const gates = req.gates.map((g) => ({
    id: g.id,
    committeeLabel: g.committeeLabel,
    ...gateState(g.decisions.map((d) => ({ id: d.id, tabledAt: d.tabledAt, withdrawn: d.withdrawnAt != null, record: recordOf(d) }))),
  }));
  if (req.gatesDeterminedOn) return { gates, finding: gateFinding(true, "NOT_CHECKED", gates) };
  const today = todayIn(new Date(), req.organisation.timeZone);
  const on = today ? dayToDate(today) : new Date();
  const live = gatesFor(route, rules, senFromDecimal(req.approvalInstances[0]?.value ?? req.estimatedValue), on);
  const why = live.state === "NOT_SET" ? "NOT_SET" : live.state === "RULE_MISSING" ? "RULE_MISSING" : "NOT_CHECKED";
  return { gates, finding: gateFinding(false, why, gates) };
}
