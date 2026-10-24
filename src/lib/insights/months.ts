/**
 * Figures by month of the financial year (design note 0007 §9). Pure.
 *
 * Each row carries its organisation day, converted by the caller at the boundary: a day column (`raisedOn`, `paidOn`) with
 * `storedDay`, an instant (`issuedAt`, `closedAt`) with `dayIn(instant, timeZone)`. Prisma cannot group by month, so the store
 * reads narrow rows and this folds them.
 */

import { addSen, type Sen } from "@/lib/money";
import { dayPlus } from "@/lib/dates";

import { inYear } from "./year";

/// One calendar month of the year, as YYYY-MM.
export type MonthKey = string;

/// Every month the year touches, first to last, empty ones included, so a gap reads as a gap. A July-start year runs July to June.
export function monthSlots(fy: { from: string; to: string }): MonthKey[] {
  const last = dayPlus(fy.to, -1).slice(0, 7);
  const out: MonthKey[] = [];
  let [y, m] = fy.from.slice(0, 7).split("-").map(Number);
  for (let key = fy.from.slice(0, 7); key <= last; key = `${y}-${String(m).padStart(2, "0")}`) {
    out.push(key);
    m += 1;
    if (m > 12) [y, m] = [y + 1, 1];
  }
  return out;
}

export interface MonthFigure {
  month: MonthKey;
  count: number;
  amount: Sen;
}

/// Counts and sums per month slot. A row outside the year is left out, never pulled into the nearest month.
export function byMonth(rows: readonly { day: string; amount?: Sen }[], fy: { from: string; to: string }): MonthFigure[] {
  const slots = new Map(monthSlots(fy).map((month) => [month, { month, count: 0, amount: 0n as Sen }]));
  for (const r of rows) {
    if (!inYear(fy, r.day)) continue;
    const slot = slots.get(r.day.slice(0, 7));
    if (!slot) continue;
    slot.count += 1;
    if (r.amount !== undefined) slot.amount = addSen(slot.amount, r.amount);
  }
  return [...slots.values()];
}
