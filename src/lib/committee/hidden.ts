import type { Tx } from "@/lib/audit/record";
import { db } from "@/lib/db";

/**
 * Which tabled matters belong to an exercise the reader may not see (FR-MTD-007, Phase 3a). A matter names its exercise in one of four ways: directly
 * (a name or appointment matter), through the bill of quantities version it tables (a scope matter), through the envelope it tables (a late bid) or through
 * the evaluation bidder it tables (a first-stage matter). All four are followed here, in one query, so no matter reaches a screen by the way a reader
 * forgot. A sitting stays visible; only a hidden matter's content is withheld (`HIDDEN_MATTER_SUBJECT`), so counts and quorum still add up.
 */

export const HIDDEN_MATTER_SUBJECT = "A matter restricted to its named people";

/// The four links, as a query: matters of any of the `exerciseIds`. The one place the list of links is written, so what hides a matter and what names its exercise cannot drift.
export function decisionOfExercisesWhere(exerciseIds: readonly string[]) {
  const h = [...exerciseIds];
  return {
    OR: [{ exerciseId: { in: h } }, { bqVersion: { exerciseId: { in: h } } }, { bidEnvelope: { exerciseId: { in: h } } }, { evaluationBidder: { evaluation: { exerciseId: { in: h } } } }],
  };
}

/// What to read of a decision to name its exercise by any of the four links; `exerciseOfDecisionRow` reads it.
export const DECISION_EXERCISE_SELECT = {
  exerciseId: true,
  bqVersion: { select: { exerciseId: true } },
  bidEnvelope: { select: { exerciseId: true } },
  evaluationBidder: { select: { evaluation: { select: { exerciseId: true } } } },
} as const;

export interface DecisionExerciseRow {
  exerciseId: string | null;
  bqVersion: { exerciseId: string } | null;
  bidEnvelope: { exerciseId: string } | null;
  evaluationBidder: { evaluation: { exerciseId: string } } | null;
}

/// The exercise a matter belongs to, along the four links in the order `hiddenDecisionIds` follows them; null for a matter of no exercise (a manual matter, a requisition's, a contract's).
export function exerciseOfDecisionRow(r: DecisionExerciseRow): string | null {
  return r.exerciseId ?? r.bqVersion?.exerciseId ?? r.bidEnvelope?.exerciseId ?? r.evaluationBidder?.evaluation.exerciseId ?? null;
}

/// The exercise of one decision, by the four links (read inside the caller's transaction where it has one).
export async function exerciseOfDecision(decisionId: string, client: Tx | typeof db = db): Promise<string | null> {
  const row = await client.committeeDecision.findUnique({ where: { id: decisionId }, select: DECISION_EXERCISE_SELECT });
  return row ? exerciseOfDecisionRow(row) : null;
}

/// The ids, among `decisionIds`, of matters of the `hidden` exercises.
export async function hiddenDecisionIds(decisionIds: readonly string[], hidden: readonly string[], client: Tx | typeof db = db): Promise<Set<string>> {
  if (decisionIds.length === 0 || hidden.length === 0) return new Set();
  const rows = await client.committeeDecision.findMany({
    where: { id: { in: [...decisionIds] }, ...decisionOfExercisesWhere(hidden) },
    select: { id: true },
  });
  return new Set(rows.map((r) => r.id));
}
