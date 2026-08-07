import { db } from "@/lib/db";
import type { AuthorityAct, Matrix, Rule } from "./types";

/// Prisma returns Decimal for money and percentage columns. Bands are compared, not
/// accumulated, so a number is safe here — every DAL threshold is well inside 2^53.
const num = (value: { toString(): string } | null): number | null =>
  value == null ? null : Number(value.toString());

export class NoActiveMatrixError extends Error {
  constructor(organisationCode: string) {
    super(
      `No DAL version is in effect for organisation "${organisationCode}". ` +
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
export async function loadMatrix(organisationCode: string, asOf: Date = new Date()): Promise<Matrix> {
  const organisation = await db.organisation.findUnique({
    where: { code: organisationCode },
    select: { id: true },
  });
  if (!organisation) throw new NoActiveMatrixError(organisationCode);

  const version = await db.authorityMatrix.findFirst({
    where: {
      organisationId: organisation.id,
      effectiveFrom: { lte: asOf },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: asOf } }],
    },
    orderBy: { effectiveFrom: "desc" },
    include: {
      rules: {
        include: { recommenders: { orderBy: { sequence: "asc" } } },
        orderBy: { sortOrder: "asc" },
      },
    },
  });
  if (!version) throw new NoActiveMatrixError(organisationCode);

  const roles = await db.authorityRole.findMany({
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

  return {
    policy: {
      boundaryValue: Number(version.boundaryValue.toString()),
      boundaryInclusive: version.boundaryInclusive,
      quotationFloor: Number(version.quotationFloor.toString()),
      tenderFloor: Number(version.tenderFloor.toString()),
      requisitionBoundary: Number(version.requisitionBoundary.toString()),
      splittingWindowDays: version.splittingWindowDays,
      currency: version.currency,
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
      effectiveFrom: { lte: asOf },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: asOf } }],
    },
    orderBy: { effectiveFrom: "desc" },
    select: { label: true },
  });
  return version?.label ?? null;
}
