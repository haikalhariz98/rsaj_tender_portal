/**
 * The one way a requisition's status is written (close-out ruling C1).
 *
 * `transitionFault` is asked inside the move, on the status read under the row lock,
 * so no action — the requisition's own, a sourcing exercise's or an award's — can write
 * a status the state machine refuses. The update is conditional on that same status:
 * a concurrent move makes it a no-op, and the caller's transaction is rolled back.
 */

import type { Prisma } from "@/generated/prisma/client";
import type { Tx } from "@/lib/audit/record";

import { transitionFault, type TransitionContext, type TransitionFault } from "./status";
import type { RequisitionStatus } from "./types";

export type MoveFault = TransitionFault | { code: "CHANGED" };

/// Thrown, so a refusal after earlier writes in the transaction rolls them all back.
export class MoveRefused extends Error {
  constructor(readonly fault: MoveFault) {
    super(fault.code);
    this.name = "MoveRefused";
  }
}

export async function moveRequisition(
  tx: Pick<Tx, "requisition">,
  from: { id: string; status: RequisitionStatus },
  to: RequisitionStatus,
  ctx: TransitionContext,
  extra: Prisma.RequisitionUpdateManyMutationInput = {},
): Promise<void> {
  const fault = transitionFault(from.status, to, ctx);
  if (fault) throw new MoveRefused(fault);
  const moved = await tx.requisition.updateMany({ where: { id: from.id, status: from.status }, data: { ...extra, status: to } });
  if (moved.count !== 1) throw new MoveRefused({ code: "CHANGED" });
}
