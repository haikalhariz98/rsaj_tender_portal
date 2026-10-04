/**
 * The damages accrual (6.13 Part B run 1b: FR-LAD-012, S; BD-613-116's act-side reading of
 * `PostAwardPolicy.ladAntiOppressionDays`). Pure.
 *
 * Per scope: the days the damages have run (from the decision's first day charged, to today or the window's close)
 * and the damages charged on issued certificates. The alert is raised where the accrual has continued beyond the
 * configured days (FR-LAD-012: "beyond a configurable period", so at the count itself not yet). Unset: "Not set", no
 * alert, never 0.
 */

import type { Provenance } from "@/lib/reference/types";
import { dayPlus, daysFrom } from "@/lib/dates";
import type { Sen } from "@/lib/money";

type Day = string;

export type AccrualAlert = { state: "NOT_SET" } | { state: "BELOW" | "ALERT"; days: number; provenance: Provenance | null };

export interface AccrualRow {
  key: string;
  label: string;
  days: number;
  charged: Sen;
  alert: AccrualAlert;
}

export function accrualOf(i: { scopes: readonly { key: string; label: string; from: Day | null; until: Day | null; charged: Sen }[]; today: Day; days: { value: number | null; provenance: Provenance | null } }): AccrualRow[] {
  return i.scopes.map((s) => {
    const end = s.until && s.until < dayPlus(i.today, 1) ? s.until : dayPlus(i.today, 1);
    const days = s.from && end > s.from ? daysFrom(s.from, end) : 0;
    const alert: AccrualAlert = i.days.value == null ? { state: "NOT_SET" } : { state: days > i.days.value ? "ALERT" : "BELOW", days: i.days.value, provenance: i.days.provenance };
    return { key: s.key, label: s.label, days, charged: s.charged, alert };
  });
}
