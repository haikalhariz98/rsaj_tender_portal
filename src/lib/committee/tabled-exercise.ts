import type { Tx } from "@/lib/audit/record";
import { hiddenExerciseIds, refuseHiddenExercise, type Reader } from "@/lib/auth/sulit-store";

import { hiddenDecisionIds } from "./hidden";

/**
 * What a tabling finds by the reference a person typed (FR-MTD-007, Phase 3a). An exercise restricted to its named people is found by no one else, and
 * reads exactly as a reference no exercise has: the caller then tables a manual matter linked to nothing, before it reads any state, late envelope or
 * evaluation bundle of the exercise. Neither the words nor the link may tell whether the exercise exists. The attempt is logged against it in `tx`.
 */
export async function exerciseByTabledReference(tx: Tx, reader: Reader, organisationId: string, reference: string) {
  const found = await tx.sourcingExercise.findMany({ where: { organisationId, reference }, select: { id: true, status: true, reference: true }, take: 2 });
  if (found.length === 1 && (await refuseHiddenExercise(tx, reader, found[0].id))) return [];
  return found;
}

/// Whether the matter a tabling would depend on is one the reader may not see (it names a hidden exercise in any of the four ways). It reads as a matter that is not there.
export async function dependencyIsHidden(tx: Tx, reader: Reader, decisionId: string): Promise<boolean> {
  return (await hiddenDecisionIds([decisionId], await hiddenExerciseIds(tx, reader), tx)).size > 0;
}
