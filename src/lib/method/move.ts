/**
 * The one way the tendering states are written (close-out ruling C1's precedent for the
 * requisition, `requisition/move.ts`): `transitionFault` is asked inside the move, on the
 * status read under the exercise's row lock, so no act can write a state the machine
 * refuses — and each tendering move names the one act that may make it (`via`). The
 * update is conditional on that same status: a concurrent move makes it a no-op and the
 * caller's transaction rolls back.
 */

import type { Prisma } from "@/generated/prisma/client";
import type { Tx } from "@/lib/audit/record";

import { transitionFault, type TransitionContext } from "./exercise";
import type { ExerciseStatus, Finding } from "./types";

/// Thrown, so a refusal after earlier writes in the transaction rolls them all back.
export class ExerciseMoveRefused extends Error {
  constructor(readonly findings: readonly Finding[]) {
    super(findings.map((f) => f.code).join(", "));
    this.name = "ExerciseMoveRefused";
  }
}

export async function moveExercise(
  tx: Pick<Tx, "sourcingExercise">,
  from: { id: string; status: ExerciseStatus },
  to: ExerciseStatus,
  ctx: TransitionContext,
  extra: Prisma.SourcingExerciseUpdateManyMutationInput = {},
): Promise<void> {
  const faults = transitionFault(from.status, to, ctx);
  if (faults.length > 0) throw new ExerciseMoveRefused(faults);
  const moved = await tx.sourcingExercise.updateMany({ where: { id: from.id, status: from.status }, data: { ...extra, status: to } });
  if (moved.count !== 1) throw new ExerciseMoveRefused([{ code: "CHANGED", level: "block" }]);
}
