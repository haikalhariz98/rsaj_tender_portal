import { db } from "@/lib/db";

import type { BudgetCode, Movement } from "./codes";
import type { Period } from "./periods";
import type { Variance } from "./finance";

/// Budget codes with their movements and the customer's control settings.
export interface BudgetCodeData {
  codes: BudgetCode[];
  movements: Movement[];
  settings: BudgetControls | null;
}

export interface BudgetControls {
  availabilityCheck: string | null;
  warningThresholdPercent: number | null;
  commitOnApproval: boolean | null;
}

export async function loadBudgetCodes(organisationCode: string): Promise<BudgetCodeData> {
  const organisation = await db.organisation.findUnique({
    where: { code: organisationCode },
    select: { id: true },
  });
  if (!organisation) return { codes: [], movements: [], settings: null };

  const [codes, settings] = await Promise.all([
    db.budgetCode.findMany({
      where: { organisationId: organisation.id },
      orderBy: { code: "asc" },
      include: { movements: true },
    }),
    db.budgetSettings.findUnique({ where: { organisationId: organisation.id } }),
  ]);

  return {
    codes: codes.map((c) => ({
      id: c.id,
      code: c.code,
      descriptionEn: c.descriptionEn,
      descriptionMs: c.descriptionMs,
      type: c.type,
      owningUnitCode: c.owningUnitCode,
      accountCode: c.accountCode,
      holderPersonId: c.holderPersonId,
      isActive: c.isActive,
      effectiveFrom: c.effectiveFrom,
      effectiveTo: c.effectiveTo,
    })),
    movements: codes.flatMap((c) =>
      c.movements.map((m) => ({
        id: m.id,
        budgetCodeId: m.budgetCodeId,
        kind: m.kind as Movement["kind"],
        reference: m.reference,
        description: m.description,
        amount: m.amount.toString(),
        occurredOn: m.occurredOn,
        releasedOn: m.releasedOn,
        releaseNote: m.releaseNote,
        counterpartCode: m.counterpartCode,
      })),
    ),
    settings: settings && {
      availabilityCheck: settings.availabilityCheck,
      warningThresholdPercent: settings.warningThresholdPercent,
      commitOnApproval: settings.commitOnApproval,
    },
  };
}

/// Budget periods and the per-year settings beside them.
export interface PeriodData {
  periods: Period[];
  rollForwardByYear: Record<number, boolean | null>;
}

export async function loadBudgetPeriods(organisationCode: string): Promise<PeriodData> {
  const organisation = await db.organisation.findUnique({
    where: { code: organisationCode },
    select: { id: true },
  });
  if (!organisation) return { periods: [], rollForwardByYear: {} };

  const [periods, years] = await Promise.all([
    db.budgetPeriod.findMany({
      where: { organisationId: organisation.id },
      orderBy: [{ year: "asc" }, { sortOrder: "asc" }],
    }),
    db.budgetYear.findMany({ where: { organisationId: organisation.id } }),
  ]);

  const rollForwardByYear: Record<number, boolean | null> = {};
  for (const y of years) rollForwardByYear[y.year] = y.rollUnspentForward;

  return {
    periods: periods.map((p) => ({
      id: p.id,
      year: p.year,
      code: p.code,
      nameEn: p.nameEn,
      nameMs: p.nameMs,
      startsOn: p.startsOn,
      endsOn: p.endsOn,
      openedOn: p.openedOn,
      closedOn: p.closedOn,
      sortOrder: p.sortOrder,
    })),
    rollForwardByYear,
  };
}

/// The finance integration: its settings, its last run, and what still differs.
export interface FinanceData {
  direction: string | null;
  schedule: string | null;
  varianceTolerance: string | null;
  lastRun: {
    startedAt: Date;
    finishedAt: Date | null;
    direction: string;
    recordsIn: number;
    recordsOut: number;
    problem: string;
  } | null;
  variances: Variance[];
}

export async function loadFinance(organisationCode: string): Promise<FinanceData> {
  const organisation = await db.organisation.findUnique({
    where: { code: organisationCode },
    select: { id: true },
  });
  if (!organisation) {
    return { direction: null, schedule: null, varianceTolerance: null, lastRun: null, variances: [] };
  }

  const [settings, run, variances] = await Promise.all([
    db.financeIntegration.findUnique({ where: { organisationId: organisation.id } }),
    db.financeSyncRun.findFirst({
      where: { organisationId: organisation.id },
      orderBy: { startedAt: "desc" },
    }),
    db.financeVariance.findMany({
      where: { organisationId: organisation.id },
      orderBy: { lastSeenAt: "desc" },
    }),
  ]);

  return {
    direction: settings?.direction ?? null,
    schedule: settings?.schedule ?? null,
    varianceTolerance: settings?.varianceTolerance?.toString() ?? null,
    lastRun: run && {
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      direction: run.direction,
      recordsIn: run.recordsIn,
      recordsOut: run.recordsOut,
      problem: run.problem,
    },
    variances: variances.map((v) => ({
      id: v.id,
      budgetCodeCode: v.budgetCodeCode,
      accountCode: v.accountCode,
      compares: v.compares,
      portalAmount: v.portalAmount.toString(),
      financeAmount: v.financeAmount.toString(),
      reason: v.reason,
      lastSeenAt: v.lastSeenAt,
      resolvedOn: v.resolvedOn,
      resolvedNote: v.resolvedNote,
    })),
  };
}
