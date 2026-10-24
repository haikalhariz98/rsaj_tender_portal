/**
 * The Dashboard's folds: what a tile or a bar shows, from the rows the store's count and groupBy queries return (design note
 * 0007 §5). Pure. Money stays `Sen` until it is formatted.
 */

import { addSen, type Sen } from "@/lib/money";
import { dayIn, daysFrom, storedDay } from "@/lib/dates";
import { CASE_PIPELINE, requisitionPipelineSplit, type CasePipelineStage } from "@/lib/dashboard/pipeline";
import { EXERCISE_PHASE, type ExercisePhase } from "@/lib/method/phase";
import type { ExerciseStatus } from "@/lib/method/types";
import type { RequisitionStatus } from "@/lib/requisition/types";

/// The middle value; for an even count, the mean of the two middle values. Null for none: no median is not a median of nought.
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/// Calendar days from the day a requisition was raised (a stored day) to the organisation day its route closed (an instant).
export function daysToApproval(raisedOn: Date, closedAt: Date, timeZone: string | null): number {
  return daysFrom(storedDay(raisedOn), dayIn(closedAt, timeZone));
}

export type PipelineStage = "WITH_CP" | ExercisePhase | CasePipelineStage;
export const PIPELINE_STAGES: readonly PipelineStage[] = ["WITH_CP", "PREPARING", "IN_MARKET", "EVALUATING", ...CASE_PIPELINE];

/**
 * The Pipeline now bars, in the case's order (§5.1), from the same three reads as Home's cards: requisitions by status under
 * `requisitionPipeline`, exercises by status under `sourcingPipeline`, and a count per case stage. With C&P is Home's
 * Requisitions card (`requisitionPipelineSplit`); the three phases add up to its Sourcing card (that filter leaves cancelled
 * exercises out, and every other status has a phase); the three case stages are its Contracts card.
 */
export function pipelineBars(rows: {
  requisitions: readonly { status: RequisitionStatus; count: number }[];
  exercises: readonly { status: ExerciseStatus; count: number }[];
  cases: Readonly<Record<CasePipelineStage, number>>;
}): { stage: PipelineStage; count: number }[] {
  const phase = new Map<ExercisePhase, number>();
  for (const r of rows.exercises) if (r.status !== "CANCELLED") phase.set(EXERCISE_PHASE[r.status], (phase.get(EXERCISE_PHASE[r.status]) ?? 0) + r.count);
  const count: Record<PipelineStage, number> = {
    WITH_CP: requisitionPipelineSplit(rows.requisitions).total,
    PREPARING: phase.get("PREPARING") ?? 0,
    IN_MARKET: phase.get("IN_MARKET") ?? 0,
    EVALUATING: phase.get("EVALUATING") ?? 0,
    ...rows.cases,
  };
  return PIPELINE_STAGES.map((stage) => ({ stage, count: count[stage] }));
}

export interface Group {
  /// The code grouped on; null for the records with none.
  key: string | null;
  label: string;
  count: number;
  amount: Sen;
}

/**
 * Rows grouped on a code, labelled. Records with no code are one group under `words.none` ("No department"), never dropped,
 * so the groups always add up to the total. A code with no label (not on the list it should be on) keeps its own group under
 * `words.unlisted`, rather than being merged into "none" or shown as a code. Largest first: by amount where there are amounts,
 * else by count; ties by label.
 */
export function groups(rows: readonly { key: string | null; count: number; amount?: Sen }[], labels: ReadonlyMap<string, string>, words: { none: string; unlisted: string }): Group[] {
  const by = new Map<string | null, Group>();
  for (const r of rows) {
    const key = r.key || null;
    const g = by.get(key) ?? { key, label: key == null ? words.none : (labels.get(key) ?? words.unlisted), count: 0, amount: 0n };
    g.count += r.count;
    if (r.amount !== undefined) g.amount = addSen(g.amount, r.amount);
    by.set(key, g);
  }
  return [...by.values()].sort((a, b) => (b.amount > a.amount ? 1 : b.amount < a.amount ? -1 : 0) || b.count - a.count || a.label.localeCompare(b.label));
}
