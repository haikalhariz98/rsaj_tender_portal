import type { Tx } from "@/lib/audit/record";
import { db } from "@/lib/db";
import type { AuthorityAct, Matrix, Rule } from "./types";
import { issuedInForce } from "./issue";

/// Prisma returns Decimal for money and percentage columns. Bands are compared, not
/// accumulated, so a number is safe here — every DAL threshold is well inside 2^53.
const num = (value: { toString(): string } | null): number | null =>
  value == null ? null : Number(value.toString());

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
    cond: r.cond,
    minValue: num(r.minValue),
    maxValue: num(r.maxValue),
    pctMin: num(r.pctMin),
    pctMax: num(r.pctMax),
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
  }));

  const matrix: Matrix = {
    policy: {
      boundaryValue: Number(version.boundaryValue.toString()),
      boundaryInclusive: version.boundaryInclusive,
      quotationFloor: Number(version.quotationFloor.toString()),
      tenderFloor: Number(version.tenderFloor.toString()),
      requisitionBoundary: Number(version.requisitionBoundary.toString()),
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
export async function loadMatrixVersion(organisationCode: string, asOf: Date = new Date()) {
  const organisation = await db.organisation.findUnique({
    where: { code: organisationCode },
    select: { id: true },
  });
  if (!organisation) return null;

  return db.authorityMatrix.findFirst({
    where: {
      organisationId: organisation.id,
      ...issuedInForce(asOf),
    },
    orderBy: { effectiveFrom: "desc" },
    select: { id: true, label: true, effectiveFrom: true, effectiveTo: true },
  });
}

/// Label of the DAL issue in force, for display and for stamping onto decisions.
export async function activeVersionLabel(
  organisationCode: string,
  asOf: Date = new Date(),
): Promise<string | null> {
  const organisation = await db.organisation.findUnique({
    where: { code: organisationCode },
    select: { id: true },
  });
  if (!organisation) return null;

  const version = await db.authorityMatrix.findFirst({
    where: {
      organisationId: organisation.id,
      ...issuedInForce(asOf),
    },
    orderBy: { effectiveFrom: "desc" },
    select: { label: true },
  });
  return version?.label ?? null;
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
