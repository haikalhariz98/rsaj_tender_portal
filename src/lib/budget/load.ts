import { db } from "@/lib/db";

import type { Allocation, Commitment } from "./availability";
import type { BudgetCode, Movement } from "./codes";
import type { Period } from "./periods";

export interface BudgetData {
  allocations: Allocation[];
  commitments: Commitment[];
}

const EMPTY: BudgetData = { allocations: [], commitments: [] };

/// Every allocation and commitment, including those whose period has passed: a past
/// requisition must still show the balance it was actually checked against.
export async function loadBudget(organisationCode: string): Promise<BudgetData> {
  const organisation = await db.organisation.findUnique({
    where: { code: organisationCode },
    select: { id: true },
  });
  if (!organisation) return EMPTY;

  const allocations = await db.budgetAllocation.findMany({
    where: { organisationId: organisation.id },
    orderBy: [{ sortOrder: "asc" }, { costCentreCode: "asc" }],
    include: { commitments: true },
  });

  return {
    allocations: allocations.map((a) => ({
      id: a.id,
      costCentreCode: a.costCentreCode,
      accountCodeCode: a.accountCodeCode,
      periodLabel: a.periodLabel,
      amount: a.amount.toString(),
      sortOrder: a.sortOrder,
      effectiveFrom: a.effectiveFrom,
      effectiveTo: a.effectiveTo,
    })),
    commitments: allocations.flatMap((a) =>
      a.commitments.map((c) => ({
        id: c.id,
        allocationId: c.allocationId,
        reference: c.reference,
        amount: c.amount.toString(),
        committedOn: c.committedOn,
        releasedOn: c.releasedOn,
      })),
    ),
  };
}

/// Provenance and notes are not needed by the arithmetic, so they are loaded only for
/// the screen.
export async function loadAllocationDetail(organisationCode: string) {
  const organisation = await db.organisation.findUnique({
    where: { code: organisationCode },
    select: { id: true },
  });
  if (!organisation) return new Map<string, { provenance: string; notes: string }>();

  const rows = await db.budgetAllocation.findMany({
    where: { organisationId: organisation.id },
    select: { id: true, provenance: true, notes: true },
  });
  return new Map(rows.map((r) => [r.id, { provenance: r.provenance as string, notes: r.notes }]));
}

/// Budget codes with their movements and the customer's control settings.
export interface BudgetCodeData {
  codes: BudgetCode[];
  movements: Movement[];
  settings: BudgetControls | null;
}

export interface BudgetControls {
  availabilityCheck: string | null;
  warningThresholdPercent: number | null;
  overCommitmentTolerancePercent: number | null;
  commitOnApproval: boolean | null;
  overrideRoleCodes: string[];
  advanceRecoupmentRatePercent: number | null;
  minimumInterimCertificate: string | null;
  paymentTargetDays: number | null;
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
      overCommitmentTolerancePercent: settings.overCommitmentTolerancePercent,
      commitOnApproval: settings.commitOnApproval,
      overrideRoleCodes: settings.overrideRoleCodes,
      advanceRecoupmentRatePercent: settings.advanceRecoupmentRatePercent,
      minimumInterimCertificate: settings.minimumInterimCertificate?.toString() ?? null,
      paymentTargetDays: settings.paymentTargetDays,
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
