import type { Tx } from "@/lib/audit/record";
import { db } from "@/lib/db";
import { amountOf } from "@/lib/money";
import type { AuthorityAct, CoreLevel, Matrix, Provenance, Rule } from "./types";
import { pinnedIssue } from "./decided-step";
import { issuedInForce } from "./issue";

/// Prisma returns Decimal for money columns. Money bands are compared in exact sen by the
/// resolver, not accumulated, so a number is safe here — every DAL threshold is well inside 2^53.
const num = (value: { toString(): string } | null): number | null =>
  value == null ? null : amountOf(value);
/// A percentage band edge as its Decimal(9,4) string (ADR 0024 Amendment 1): never a float.
const pctEdge = (value: { toString(): string } | null): string | null => (value == null ? null : value.toString());

export class NoActiveMatrixError extends Error {
  constructor() {
    super(
      `No approval matrix is in force. ` +
        `Seed one before resolving approvals.`,
    );
    this.name = "NoActiveMatrixError";
  }
}

/**
 * Load the DAL matrix that is in effect for an organisation.
 *
 * Effective-dating is honoured rather than "latest wins": a matter raised while an
 * earlier issue was in force must route by that issue, and re-running a historical
 * decision has to reproduce the chain that was actually followed.
 */
export async function loadMatrix(
  organisationCode: string,
  asOf: Date = new Date(),
  /// A specific issue, draft or not — for the screen that edits it. Routing never
  /// passes this: it takes the issue in force, which is never a draft.
  issueId?: string,
): Promise<Matrix> {
  const found = await loadIssue(organisationCode, asOf, issueId, null);
  if (!found) throw new NoActiveMatrixError();
  return found.matrix;
}

/**
 * A funder's rule set in force on a date for one funding route, or null where none
 * is issued (FR-REQ-006). Null is an answer, not an error: the matter then routes by
 * the organisation's own limits and says the funder's rules are not held.
 */
export async function loadOverrideMatrix(organisationCode: string, fundingRouteCode: string, asOf: Date = new Date(), client: Tx = db) {
  return loadIssue(organisationCode, asOf, undefined, fundingRouteCode, client);
}

/// The issue in force (or the one asked for) with its id and label, and the pure
/// matrix built from it.
export async function loadIssue(
  organisationCode: string,
  asOf: Date,
  issueId: string | undefined,
  fundingRouteCode: string | null,
  /// A write reads the rules inside its own locked transaction.
  client: Tx = db,
): Promise<{ id: string; label: string; matrix: Matrix } | null> {
  const organisation = await client.organisation.findUnique({
    where: { code: organisationCode },
    select: { id: true },
  });
  if (!organisation) return null;

  const version = await client.authorityMatrix.findFirst({
    where: issueId
      ? { organisationId: organisation.id, id: issueId }
      : { organisationId: organisation.id, ...issuedInForce(asOf, fundingRouteCode) },
    orderBy: { effectiveFrom: "desc" },
    include: {
      rules: {
        include: { recommenders: { orderBy: { sequence: "asc" } } },
        orderBy: { sortOrder: "asc" },
      },
      // The issue's own core routing (FR-APR-004): never another issue's.
      coreRouting: {
        include: { steps: { orderBy: { sequence: "asc" } } },
        orderBy: [{ sortOrder: "asc" }, { approverCode: "asc" }],
      },
    },
  });
  if (!version) return null;

  const roles = await client.authorityRole.findMany({
    where: { organisationId: organisation.id },
    orderBy: { sortOrder: "asc" },
  });

  const rules: Rule[] = version.rules.map((r) => ({
    ruleKey: r.ruleKey,
    domain: r.domain,
    method: r.method,
    contractTypeCode: r.contractTypeCode,
    cond: r.cond,
    minValue: num(r.minValue),
    maxValue: num(r.maxValue),
    pctMin: pctEdge(r.pctMin),
    pctMax: pctEdge(r.pctMax),
    contractValueMin: num(r.contractValueMin),
    contractValueMax: num(r.contractValueMax),
    followsBoundarySwitch: r.followsBoundarySwitch,
    labelEn: r.labelEn,
    labelMs: r.labelMs,
    proposerCode: r.proposerCode,
    approverCode: r.approverCode,
    committeeCode: r.committeeCode,
    committeeAct: r.committeeAct as AuthorityAct | null,
    nonDelegable: r.nonDelegable,
    approverMandatory: r.approverMandatory,
    isGap: r.isGap,
    gapNote: r.gapNote,
    note: r.note,
    clause: r.clause,
    sortOrder: r.sortOrder,
    recommenders: r.recommenders.map((rec) => ({
      roleCode: rec.roleCode,
      act: rec.act as AuthorityAct,
    })),
    generateCoreChain: r.generateCoreChain,
    coreChainReason: r.coreChainReason,
    choiceOptionEn: r.choiceOptionEn,
    chosen: r.chosen,
  }));

  const coreRouting: CoreLevel[] = version.coreRouting.map((l) => ({
    approverCode: l.approverCode,
    clause: l.clause,
    provenance: l.provenance as Provenance,
    ...(l.note ? { note: l.note } : {}),
    steps: l.steps.map((st) => ({
      roleCode: st.roleCode,
      act: st.act as AuthorityAct,
      provenance: st.provenance as Provenance,
      ...(st.note ? { note: st.note } : {}),
    })),
  }));

  const matrix: Matrix = {
    policy: {
      boundaryValue: amountOf(version.boundaryValue),
      boundaryInclusive: version.boundaryInclusive,
      quotationFloor: amountOf(version.quotationFloor),
      tenderFloor: amountOf(version.tenderFloor),
      requisitionBoundary: amountOf(version.requisitionBoundary),
      currency: version.currency,
      clauses: {
        noRule: version.noRuleClause,
        selfApproval: version.selfApprovalClause,
        absence: version.absenceClause,
        funderOverride: version.funderOverrideClause,
      },
    },
    roles: Object.fromEntries(
      roles.map((r) => [
        r.code,
        {
          code: r.code,
          nameEn: r.nameEn,
          nameMs: r.nameMs,
          isCommittee: r.isCommittee,
          escalatesToCode: r.escalatesToCode,
          selfApprovalEscalatesToCode: r.selfApprovalEscalatesToCode,
        },
      ]),
    ),
    rules,
    coreRouting,
  };
  return { id: version.id, label: version.label, matrix };
}

/**
 * The issue itself — id, label and period.
 *
 * Kept apart from `loadMatrix`, which returns the pure `Matrix` the resolver works on.
 * The resolver has no business knowing a row's primary key, but the screen that edits
 * the thresholds does.
 */
export async function loadMatrixVersion(organisationCode: string, asOf: Date = new Date(), fundingRouteCode: string | null = null, client: Tx = db) {
  const organisation = await client.organisation.findUnique({
    where: { code: organisationCode },
    select: { id: true },
  });
  if (!organisation) return null;

  return client.authorityMatrix.findFirst({
    where: {
      organisationId: organisation.id,
      ...issuedInForce(asOf, fundingRouteCode),
    },
    orderBy: { effectiveFrom: "desc" },
    select: { id: true, label: true, effectiveFrom: true, effectiveTo: true },
  });
}

/// Every issue, newest first, with its state — for choosing which one to look at.
export async function listIssues(organisationCode: string) {
  const organisation = await db.organisation.findUnique({
    where: { code: organisationCode },
    select: { id: true },
  });
  if (!organisation) return [];
  return db.authorityMatrix.findMany({
    where: { organisationId: organisation.id },
    orderBy: [{ effectiveFrom: "desc" }, { label: "asc" }],
    select: { id: true, label: true, effectiveFrom: true, effectiveTo: true, issuedAt: true, fundingRouteCode: true },
  });
}

export type IssueSummary = Awaited<ReturnType<typeof listIssues>>[number];

/**
 * Row ids for one issue's rules and their recommender steps, by rule key.
 *
 * Kept out of `Matrix` so the resolver still cannot see a primary key; only the
 * screen that edits the rules needs them. Safe because a rule key is unique within
 * an issue.
 */
export async function loadRuleRows(issueId: string) {
  const rows = await db.authorityRule.findMany({
    where: { authorityMatrixId: issueId },
    select: {
      id: true,
      ruleKey: true,
      recommenders: {
        orderBy: { sequence: "asc" },
        select: { id: true, roleCode: true, act: true, sequence: true },
      },
    },
  });
  return Object.fromEntries(rows.map((r) => [r.ruleKey, r]));
}

/**
 * Row ids for one issue's core routing, by approving office — for the screen that edits
 * it. Kept out of `Matrix` for the same reason as `loadRuleRows`.
 */
export async function loadCoreRows(issueId: string) {
  const rows = await db.coreRoutingLevel.findMany({
    where: { authorityMatrixId: issueId },
    select: {
      id: true,
      approverCode: true,
      clause: true,
      provenance: true,
      note: true,
      sortOrder: true,
      steps: { orderBy: { sequence: "asc" }, select: { id: true, roleCode: true, act: true, sequence: true, provenance: true, note: true } },
    },
    orderBy: [{ sortOrder: "asc" }, { approverCode: "asc" }],
  });
  return rows;
}

/**
 * The rule a route was opened under, read from the issue it pinned (FR-APR-019, ruling
 * R4). Issued issues are locked, so this is the rule as it stood. Null where the route
 * pinned no rule (a received trail) or the rule is not found: "band not recorded".
 */
export async function loadPinnedRule(
  route: { ruleKey: string | null; authorityMatrixId: string | null; matrixLabel: string | null; fundingOverrideApplied: boolean; overrideMatrixId: string | null; overrideMatrixLabel: string | null },
  client: Tx = db,
) {
  const issueId = pinnedIssue(route).id;
  if (!route.ruleKey || !issueId) return null;
  return client.authorityRule.findFirst({
    where: { authorityMatrixId: issueId, ruleKey: route.ruleKey },
    select: { minValue: true, maxValue: true, contractValueMin: true, contractValueMax: true, clause: true },
  });
}
