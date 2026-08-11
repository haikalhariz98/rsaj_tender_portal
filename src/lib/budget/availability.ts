/**
 * What is left to spend.
 *
 * Pure, and exact: every figure is an integer number of sen. A balance that drifts
 * against the finance system is worse than no balance at all, because an officer will
 * act on it.
 */

import { addSen, compareSen, parseSen, subtractSen, type Sen } from "@/lib/money";
import { inForceOn, type Effective } from "@/lib/effective";

export interface Allocation extends Effective {
  id: string;
  costCentreCode: string;
  accountCodeCode: string;
  periodLabel: string;
  /// Decimal string, as held in the database.
  amount: string;
  sortOrder: number;
}

export interface Commitment {
  id: string;
  allocationId: string;
  reference: string;
  amount: string;
  committedOn: Date;
  /// Set where the commitment was stood down. A released commitment no longer holds
  /// money but stays on record, because it is part of how the balance moved.
  releasedOn: Date | null;
}

export interface Availability {
  allocated: Sen;
  committed: Sen;
  /// Allocated less committed. Negative where more has been committed than allocated,
  /// which is a real condition and is shown rather than clamped to zero.
  balance: Sen;
  overcommitted: boolean;
}

/// Commitments still holding money on a date.
export function liveCommitments(
  commitments: readonly Commitment[],
  allocationId: string,
  on: Date,
): Commitment[] {
  return commitments.filter(
    (c) =>
      c.allocationId === allocationId &&
      c.committedOn <= on &&
      (c.releasedOn == null || c.releasedOn > on),
  );
}

export function availabilityOf(
  allocation: Allocation,
  commitments: readonly Commitment[],
  on: Date,
): Availability {
  const allocated = parseSen(allocation.amount);
  const committed = addSen(
    ...liveCommitments(commitments, allocation.id, on).map((c) => parseSen(c.amount)),
  );
  const balance = subtractSen(allocated, committed);
  return { allocated, committed, balance, overcommitted: balance < 0n };
}

/**
 * The allocation a requisition is checked against.
 *
 * A cost centre and account code pair may have more than one allocation over time —
 * an original and a supplementary. Only one may be in force on a date; where two are,
 * that is a configuration fault and `null` is returned rather than a guess at which
 * the officer meant.
 */
export function allocationFor(
  allocations: readonly Allocation[],
  costCentreCode: string,
  accountCodeCode: string,
  on: Date,
): { allocation: Allocation | null; ambiguous: boolean } {
  const matches = allocations.filter(
    (a) =>
      a.costCentreCode === costCentreCode &&
      a.accountCodeCode === accountCodeCode &&
      inForceOn(a, on),
  );
  if (matches.length === 1) return { allocation: matches[0], ambiguous: false };
  if (matches.length === 0) return { allocation: null, ambiguous: false };
  return { allocation: null, ambiguous: true };
}

/**
 * Whether a requirement of this value can proceed.
 *
 * Four answers, not two. "No allocation" is not "no money" — nobody has set one, and
 * the difference decides whether an officer chases finance or chases configuration.
 */
export type BudgetVerdict =
  | { state: "WITHIN"; availability: Availability; remainingAfter: Sen }
  | { state: "EXCEEDS"; availability: Availability; shortfall: Sen }
  | { state: "NO_ALLOCATION" }
  | { state: "AMBIGUOUS" };

export function checkAgainstBudget(
  allocations: readonly Allocation[],
  commitments: readonly Commitment[],
  request: { costCentreCode: string; accountCodeCode: string; amount: string },
  on: Date,
): BudgetVerdict {
  const { allocation, ambiguous } = allocationFor(
    allocations,
    request.costCentreCode,
    request.accountCodeCode,
    on,
  );
  if (ambiguous) return { state: "AMBIGUOUS" };
  if (!allocation) return { state: "NO_ALLOCATION" };

  const availability = availabilityOf(allocation, commitments, on);
  const wanted = parseSen(request.amount);
  const remainingAfter = subtractSen(availability.balance, wanted);

  // Exactly exhausting the allocation is within it. Only going past is not.
  if (compareSen(remainingAfter, 0n) >= 0) {
    return { state: "WITHIN", availability, remainingAfter };
  }
  return { state: "EXCEEDS", availability, shortfall: -remainingAfter };
}

/// Totals across every allocation in force, for the summary on the screen.
export function totalsOn(
  allocations: readonly Allocation[],
  commitments: readonly Commitment[],
  on: Date,
): Availability {
  const live = allocations.filter((a) => inForceOn(a, on));
  const allocated = addSen(...live.map((a) => parseSen(a.amount)));
  const committed = addSen(
    ...live.flatMap((a) => liveCommitments(commitments, a.id, on).map((c) => parseSen(c.amount))),
  );
  const balance = subtractSen(allocated, committed);
  return { allocated, committed, balance, overcommitted: balance < 0n };
}
