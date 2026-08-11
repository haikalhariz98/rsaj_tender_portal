import { db } from "@/lib/db";

import type { Allocation, Commitment } from "./availability";

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
