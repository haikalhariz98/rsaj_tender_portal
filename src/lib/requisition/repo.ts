/**
 * Requisitions, loaded. Reads only; every rule is in the pure modules beside this.
 * `withLockedRequisition` is how every write reads: it locks the requisition's row and
 * re-reads it inside the write's own transaction, so a check and the write it guards
 * see the same data (the pattern 6.10's sittings use).
 */

import type { Tx } from "@/lib/audit/record";
import type { BudgetCode as PureBudgetCode } from "@/lib/budget/codes";
import { decisionRecord, type DecisionRecord } from "@/lib/committee/record";
import { isRegisterSnapshot } from "@/lib/committee/assess-sitting";
import { todayIn } from "@/lib/dates";
import { db } from "@/lib/db";
import { ORGANISATION_CODE } from "@/lib/org";
import type { CodeFormat, OrgUnit, OrgUnitKind } from "@/lib/organisation/types";
import type { FundingRouteRow } from "@/lib/requisition/funding";
import type { Lookups, RequisitionDraft } from "@/lib/requisition/fields";
import { SPLIT_KEYS, UNSET_POLICY, type Provenance, type RequisitionPolicy, type SplitKey } from "@/lib/requisition/types";

export const num = (v: { toString(): string } | null | undefined): number | null => (v == null ? null : Number(v.toString()));

/// The organisation's id, zone and today (null while no zone is set).
export async function requisitionOrg(client: Tx = db) {
  const org = await client.organisation.findUnique({ where: { code: ORGANISATION_CODE }, select: { id: true, timeZone: true } });
  if (!org) return null;
  return { id: org.id, timeZone: org.timeZone, today: todayIn(new Date(), org.timeZone) };
}

export async function loadPolicy(organisationId: string, client: Tx = db): Promise<RequisitionPolicy & { id: string | null; notes: string }> {
  const row = await client.requisitionPolicy.findUnique({ where: { organisationId } });
  if (!row) return { ...UNSET_POLICY, id: null, notes: "" };
  return {
    id: row.id,
    notes: row.notes,
    splittingWindowDays: row.splittingWindowDays,
    splittingMatchOn: row.splittingMatchOn.filter((k): k is SplitKey => (SPLIT_KEYS as readonly string[]).includes(k)),
    splittingAggregateAcrossYear: row.splittingAggregateAcrossYear,
    budgetRecheckDays: row.budgetRecheckDays,
    endorsementTiers: row.endorsementTiers as OrgUnitKind[],
    erpReferenceRequired: row.erpReferenceRequired,
    provenance: (row.provenance as Provenance | null) ?? null,
  };
}

/// The settings a requisition reads from other screens: budget and finance.
export async function loadControls(organisationId: string, client: Tx = db) {
  const [budget, finance] = await Promise.all([
    client.budgetSettings.findUnique({ where: { organisationId } }),
    client.financeIntegration.findUnique({ where: { organisationId } }),
  ]);
  return {
    availabilityCheck: budget?.availabilityCheck ?? null,
    commitOnApproval: budget?.commitOnApproval ?? null,
    budgetCheckSource: finance?.budgetCheckSource ?? null,
  };
}

/// The lists a requisition's fields are looked up against, and the code formats.
export async function loadLookups(organisationId: string, client: Tx = db) {
  const where = { organisationId };
  const [units, costCentres, accountCodes, sites, budgetCodes, people, fundingRoutes, formats, contractTypes] = await Promise.all([
    client.orgUnit.findMany({ where, orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }] }),
    client.costCentre.findMany({ where, orderBy: [{ sortOrder: "asc" }, { code: "asc" }] }),
    client.accountCode.findMany({ where, orderBy: [{ sortOrder: "asc" }, { code: "asc" }] }),
    client.site.findMany({ where, orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }] }),
    client.budgetCode.findMany({ where, orderBy: { code: "asc" } }),
    client.person.findMany({ where, orderBy: { name: "asc" }, select: { id: true, name: true, isActive: true, jobTitle: true } }),
    client.fundingRoute.findMany({ where, orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }] }),
    client.codeFormat.findMany({ where }),
    client.contractType.findMany({ where, orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }] }),
  ]);
  const lookups: LoadedLookups = {
    units: units.map((u) => ({ ...u, kind: u.kind as OrgUnitKind, provenance: u.provenance as Provenance })),
    costCentres,
    accountCodes,
    sites,
    budgetCodes,
    people,
    fundingRoutes: fundingRoutes.map((r) => ({ ...r, provenance: r.provenance as Provenance })),
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
  people: { id: string; name: string; isActive: boolean; jobTitle: string | null }[];
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
    orderBy: { openedAt: "desc" as const },
    include: {
      steps: {
        orderBy: { sequence: "asc" as const },
        include: {
          delegation: { select: { id: true, fromPerson: { select: { name: true } } } },
          committeeDecision: {
            include: { meeting: { include: { committee: { select: { nameEn: true, code: true } } } }, votes: { include: { person: { select: { name: true } } } } },
          },
        },
      },
    },
  },
  committeeDecisions: {
    include: { meeting: { include: { committee: { select: { nameEn: true, code: true } } } }, votes: { include: { person: { select: { name: true } } } } },
    orderBy: { tabledAt: "desc" as const },
  },
};

export async function loadRequisition(id: string, client: Tx = db) {
  const org = await requisitionOrg(client);
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
export function recordOf(d: RequisitionRow["committeeDecisions"][number]): DecisionRecord | null {
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
export async function withLockedRequisition<T>(id: string, fn: (tx: Tx, l: LoadedRequisition) => Promise<T>): Promise<T | null> {
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Requisition" WHERE id = ${id} FOR UPDATE`;
      const l = await loadRequisition(id, tx);
      if (!l) return null;
      return fn(tx, l);
    },
    { timeout: 20_000, maxWait: 10_000 },
  );
}

export const REQUISITIONS_PAGE = 100;

/// The organisation's requisitions for the list, newest first, with what the list shows.
export async function listRequisitions() {
  const org = await requisitionOrg();
  if (!org) return { org: null, rows: [], total: 0, counts: { open: 0, pending: 0, overBudget: 0, flagged: 0 } };
  const where = { organisationId: org.id };
  const [rows, total, routes, units] = await Promise.all([
    db.requisition.findMany({
      where,
      orderBy: [{ raisedOn: "desc" }, { reference: "desc" }],
      take: REQUISITIONS_PAGE,
      include: {
        budgetChecks: { orderBy: { checkedAt: "desc" }, take: 1, select: { verdict: true } },
        splitChecks: { orderBy: { checkedAt: "desc" }, take: 1, select: { state: true, overrideJustification: true } },
      },
    }),
    db.requisition.count({ where }),
    db.fundingRoute.findMany({ where, select: { code: true, nameEn: true } }),
    db.orgUnit.findMany({ where, select: { code: true, nameEn: true, effectiveFrom: true }, orderBy: { effectiveFrom: "desc" } }),
  ]);
  const [open, pending, overBudget, flagged] = await Promise.all([
    db.requisition.count({ where: { ...where, status: { notIn: ["CANCELLED", "CLOSED", "APPROVED", "SOURCING", "PARTIALLY_FULFILLED", "FULFILLED"] } } }),
    db.requisition.count({ where: { ...where, status: "PENDING_APPROVAL" } }),
    db.requisition.count({ where: { ...where, status: "OVER_BUDGET" } }),
    db.requisition.count({
      where: { ...where, status: { notIn: ["CANCELLED", "CLOSED"] }, splitChecks: { some: { state: "FLAGGED", overrideJustification: null } } },
    }),
  ]);
  const unitName = new Map<string, string>();
  for (const u of units) if (!unitName.has(u.code)) unitName.set(u.code, u.nameEn);
  return {
    org,
    rows: rows.map((r) => ({
      ...r,
      value: num(r.estimatedValue)!,
      unitName: unitName.get(r.requestingUnitCode) ?? "A unit no longer configured",
      routeName: r.fundingRouteCode ? (routes.find((x) => x.code === r.fundingRouteCode)?.nameEn ?? "A route no longer configured") : null,
      verdict: r.budgetChecks[0]?.verdict ?? null,
      split: r.splitChecks[0] ?? null,
    })),
    total,
    counts: { open, pending, overBudget, flagged },
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
    lines: req.lines.map((x) => ({
      description: x.description,
      quantity: x.quantity?.toString() ?? null,
      unit: x.unit,
      estimatedUnitPrice: x.estimatedUnitPrice?.toString() ?? null,
      estimatedAmount: x.estimatedAmount.toString(),
    })),
  };
}
