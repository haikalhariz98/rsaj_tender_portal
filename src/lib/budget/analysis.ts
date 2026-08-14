/**
 * The two analyses the availability screen draws.
 *
 * Both are read off the movement ledger at a date, so the chart and the table under
 * it are the same numbers — the "show the figures" table is the chart's own data,
 * not a second calculation that could drift from it.
 */

import { addSen, senFromDecimal, subtractSen, type Sen } from "@/lib/money";

import { figuresFor, percentUsed, type BudgetCode, type Movement } from "./codes";
import type { Period } from "./periods";

export interface PeriodSpend {
  period: Period;
  /// Cumulative to the end of this period, which is how the line is drawn.
  allocated: Sen;
  actualSpend: Sen;
  spendPlusCommitments: Sen;
}

/**
 * Spend against allocation, period by period, cumulative across the year.
 *
 * Cumulative because the question is whether the year is on course, and a monthly
 * bar answers a different one. Each point reads the ledger as at that period's end,
 * so a movement dated later has not happened yet.
 */
export function spendByPeriod(
  periods: readonly Period[],
  codes: readonly BudgetCode[],
  movements: readonly Movement[],
): PeriodSpend[] {
  return [...periods]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code))
    .map((period) => {
      const asAt = period.endsOn;
      let allocated = 0n;
      let actualSpend = 0n;
      let committed = 0n;

      for (const c of codes) {
        const f = figuresFor(movements, c.id, asAt);
        allocated = addSen(allocated, f.allocated);
        actualSpend = addSen(actualSpend, f.actualSpend);
        committed = addSen(committed, f.committed);
      }

      return {
        period,
        allocated,
        actualSpend,
        spendPlusCommitments: addSen(actualSpend, committed),
      };
    });
}

export interface UnitUtilisation {
  unitCode: string;
  allocated: Sen;
  committed: Sen;
  actualSpend: Sen;
  available: Sen;
  /// Null where the unit's codes carry no allocation at all.
  utilisation: number | null;
}

/**
 * How much of what each unit was given has been spoken for.
 *
 * Codes with no owning unit are grouped under the empty code rather than dropped —
 * a budget nobody owns is exactly the thing worth seeing.
 */
export function utilisationByUnit(
  codes: readonly BudgetCode[],
  movements: readonly Movement[],
  on: Date,
): UnitUtilisation[] {
  const byUnit = new Map<string, UnitUtilisation>();

  for (const c of codes) {
    const key = c.owningUnitCode ?? "";
    const f = figuresFor(movements, c.id, on);
    const row = byUnit.get(key) ?? {
      unitCode: key,
      allocated: 0n,
      committed: 0n,
      actualSpend: 0n,
      available: 0n,
      utilisation: null,
    };
    row.allocated = addSen(row.allocated, f.allocated);
    row.committed = addSen(row.committed, f.committed);
    row.actualSpend = addSen(row.actualSpend, f.actualSpend);
    byUnit.set(key, row);
  }

  return [...byUnit.values()]
    .map((r) => ({
      ...r,
      available: subtractSen(subtractSen(r.allocated, r.committed), r.actualSpend),
      utilisation: percentUsed(r.allocated, r.committed, r.actualSpend),
    }))
    .sort((a, b) => (b.utilisation ?? -1) - (a.utilisation ?? -1));
}

/**
 * Every movement against one code, newest first, for the movements drawer.
 *
 * A released commitment stays on the list. It held budget for a time, and a trail
 * that drops it cannot explain why the balance moved and then moved back.
 */
export interface MovementRow {
  id: string;
  reference: string;
  description: string;
  kind: Movement["kind"];
  amount: Sen;
  occurredOn: Date;
  releasedOn: Date | null;
}

export function movementRows(
  movements: readonly Movement[],
  budgetCodeId: string,
  on: Date,
): MovementRow[] {
  return movements
    .filter((m) => m.budgetCodeId === budgetCodeId && m.occurredOn <= on)
    .map((m) => ({
      id: m.id,
      reference: m.reference,
      description: m.description,
      kind: m.kind,
      amount: senFromDecimal(m.amount),
      occurredOn: m.occurredOn,
      releasedOn: m.releasedOn,
    }))
    .sort((a, b) => b.occurredOn.getTime() - a.occurredOn.getTime());
}

/// What a movement reads as on the drawer's list.
export function movementStatus(row: MovementRow, on: Date): string {
  if (row.kind === "ACTUAL_SPEND") return "Actual spend";
  if (row.kind !== "COMMITMENT") return "Allocation";
  return row.releasedOn && row.releasedOn <= on ? "Released" : "Committed";
}
