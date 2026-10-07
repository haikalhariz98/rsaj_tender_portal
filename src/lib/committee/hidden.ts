import type { Tx } from "@/lib/audit/record";
import { db } from "@/lib/db";

/**
 * Which tabled matters belong to an exercise the reader may not see (FR-MTD-007, Phase 3a). A matter names its exercise in one of four ways: directly
 * (a name or appointment matter), through the bill of quantities version it tables (a scope matter), through the envelope it tables (a late bid) or through
 * the evaluation bidder it tables (a first-stage matter). All four are followed here, in one query, so no matter reaches a screen by the way a reader
 * forgot. A sitting stays visible; only a hidden matter's content is withheld (`HIDDEN_MATTER_SUBJECT`), so counts and quorum still add up.
 */

export const HIDDEN_MATTER_SUBJECT = "A matter restricted to its named people";

/// The ids, among `decisionIds`, of matters of the `hidden` exercises.
export async function hiddenDecisionIds(decisionIds: readonly string[], hidden: readonly string[], client: Tx | typeof db = db): Promise<Set<string>> {
  if (decisionIds.length === 0 || hidden.length === 0) return new Set();
  const h = [...hidden];
  const rows = await client.committeeDecision.findMany({
    where: {
      id: { in: [...decisionIds] },
      OR: [{ exerciseId: { in: h } }, { bqVersion: { exerciseId: { in: h } } }, { bidEnvelope: { exerciseId: { in: h } } }, { evaluationBidder: { evaluation: { exerciseId: { in: h } } } }],
    },
    select: { id: true },
  });
  return new Set(rows.map((r) => r.id));
}
