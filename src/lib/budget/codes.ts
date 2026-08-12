/**
 * What a budget code is worth, and how much of it is gone.
 *
 * Nothing here is stored. The sample shows allocated, committed, actual spend,
 * available and utilisation side by side, and every one of them is arithmetic over
 * the movement ledger — so a column holding any of them could disagree with the rows
 * that produced it, which is the sort of disagreement an audit cannot resolve.
 *
 * Pure, and in sen throughout. Money crosses the boundary as a decimal string and is
 * converted once, on the way in.
 */

import { addSen, compareSen, senFromDecimal, subtractSen, type Sen } from "@/lib/money";
import type { Effective } from "@/lib/effective";

export type MovementKind =
  | "ORIGINAL"
  | "REVISION"
  | "TRANSFER_IN"
  | "TRANSFER_OUT"
  | "COMMITMENT"
  | "ACTUAL_SPEND";

export interface BudgetCode extends Effective {
  id: string;
  code: string;
  descriptionEn: string;
  descriptionMs: string | null;
  type: string;
  owningUnitCode: string | null;
  accountCode: string;
  holderPersonId: string | null;
  isActive: boolean;
}

export interface Movement {
  id: string;
  budgetCodeId: string;
  kind: MovementKind;
  reference: string;
  description: string;
  /// A decimal string, always positive. The kind carries the direction.
  amount: string;
  occurredOn: Date;
  releasedOn: Date | null;
  releaseNote: string;
  counterpartCode: string | null;
}

export interface Figures {
  /// Original, plus revisions, plus transfers in, less transfers out.
  allocated: Sen;
  /// Approved and holding budget, but not yet paid. Released ones do not count.
  committed: Sen;
  actualSpend: Sen;
  /// What is left. Goes negative rather than clamping — an over-commitment that
  /// renders as zero is an over-commitment nobody sees.
  available: Sen;
  /**
   * How much is gone, as a percentage of what was allocated.
   *
   * Null where nothing has been allocated. Not zero: a code with no allocation has
   * not used none of its budget, it has no budget, and a meter drawn at 0% says the
   * opposite of that.
   */
  utilisation: number | null;
}

const ALLOCATING: MovementKind[] = ["ORIGINAL", "REVISION", "TRANSFER_IN"];

/// Movements belonging to one code, on a date. Anything dated later is not yet real.
export function movementsFor(
  movements: readonly Movement[],
  budgetCodeId: string,
  on: Date,
): Movement[] {
  return movements.filter((m) => m.budgetCodeId === budgetCodeId && m.occurredOn <= on);
}

export function figuresFor(
  movements: readonly Movement[],
  budgetCodeId: string,
  on: Date,
): Figures {
  const mine = movementsFor(movements, budgetCodeId, on);
  const total = (kinds: MovementKind[], extra: (m: Movement) => boolean = () => true) =>
    addSen(
      ...mine.filter((m) => kinds.includes(m.kind) && extra(m)).map((m) => senFromDecimal(m.amount)),
    );

  const allocated = subtractSen(total(ALLOCATING), total(["TRANSFER_OUT"]));
  // A commitment released before the date being asked about is holding nothing.
  const committed = total(["COMMITMENT"], (m) => m.releasedOn == null || m.releasedOn > on);
  const actualSpend = total(["ACTUAL_SPEND"]);
  const available = subtractSen(subtractSen(allocated, committed), actualSpend);

  return {
    allocated,
    committed,
    actualSpend,
    available,
    utilisation: percentUsed(allocated, committed, actualSpend),
  };
}

/// The allocation ledger the Allocations tab totals: what it started at, what was
/// revised, and what moved between codes.
export interface AllocationLedger {
  original: Sen;
  revisions: Sen;
  transfers: Sen;
  current: Sen;
}

export function ledgerFor(
  movements: readonly Movement[],
  budgetCodeId: string,
  on: Date,
): AllocationLedger {
  const mine = movementsFor(movements, budgetCodeId, on);
  const sum = (kind: MovementKind) =>
    addSen(...mine.filter((m) => m.kind === kind).map((m) => senFromDecimal(m.amount)));

  const original = sum("ORIGINAL");
  const revisions = sum("REVISION");
  const transfers = subtractSen(sum("TRANSFER_IN"), sum("TRANSFER_OUT"));

  return { original, revisions, transfers, current: addSen(original, revisions, transfers) };
}

/**
 * How much of an allocation is spoken for.
 *
 * Committed and spent both count: money held against an approved requirement is not
 * available, whether or not the invoice has arrived.
 */
export function percentUsed(allocated: Sen, committed: Sen, actualSpend: Sen): number | null {
  if (allocated <= 0n) return null;
  const used = addSen(committed, actualSpend);
  return Number((used * 10000n) / allocated) / 100;
}

/**
 * Whether utilisation has reached the customer's warning threshold.
 *
 * Three states, not two. A threshold nobody has configured cannot be reached or
 * missed, and painting the meter as safe would claim a decision nobody took.
 */
export type ThresholdState = "UNDER" | "AT_OR_OVER" | "NOT_SET";

export function thresholdState(
  utilisation: number | null,
  warningThresholdPercent: number | null | undefined,
): ThresholdState {
  if (warningThresholdPercent == null || utilisation == null) return "NOT_SET";
  return utilisation >= warningThresholdPercent ? "AT_OR_OVER" : "UNDER";
}

/// The codes a requirement may be charged to on a date: in force, and not withdrawn.
export function offerableOn(codes: readonly BudgetCode[], on: Date): BudgetCode[] {
  return codes.filter(
    (c) => c.isActive && c.effectiveFrom <= on && (c.effectiveTo == null || c.effectiveTo > on),
  );
}

/// Totals across a set of codes, for the figures above the list.
export function totalsAcross(
  codes: readonly BudgetCode[],
  movements: readonly Movement[],
  on: Date,
): Figures {
  const each = codes.map((c) => figuresFor(movements, c.id, on));
  const allocated = addSen(...each.map((f) => f.allocated));
  const committed = addSen(...each.map((f) => f.committed));
  const actualSpend = addSen(...each.map((f) => f.actualSpend));

  return {
    allocated,
    committed,
    actualSpend,
    available: subtractSen(subtractSen(allocated, committed), actualSpend),
    utilisation: percentUsed(allocated, committed, actualSpend),
  };
}

/// Whether a proposed charge fits. Exactly exhausting the balance fits.
export function fitsWithin(available: Sen, amount: Sen): boolean {
  return compareSen(amount, available) <= 0;
}
