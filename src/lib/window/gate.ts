/**
 * What the award gate reads of the invitation window (X-9, 6.5's interim position until 6.7
 * replaces it): the phase now, derived from the stored instants (ADR 0014), and whether a change
 * to the window is with approval. Pure.
 */

import { windowChangeRoutesOf } from "@/lib/method/approval";
import type { ExerciseStatus } from "@/lib/method/types";

import { windowPhase, type WindowPhase } from "./phase";

export interface WindowGate {
  phase: WindowPhase;
  /// A window_change route is pending: the closing (or the exercise itself) may yet change.
  changePending: boolean;
}

export function windowGate(
  ex: { status: ExerciseStatus; closingAt: Date | null; approvalInstances: readonly { domain: string; awardId?: string | null; status: string }[] },
  w: { purchaseFromDay: Date | null; purchaseCloseDay: Date | null } | null,
  now: Date,
  timeZone: string | null,
): WindowGate {
  const { phase } = windowPhase({ status: ex.status, purchaseFromDay: w?.purchaseFromDay ?? null, purchaseCloseDay: w?.purchaseCloseDay ?? null, closingAt: ex.closingAt }, now, timeZone);
  return { phase, changePending: windowChangeRoutesOf(ex.approvalInstances).some((r) => r.status === "PENDING") };
}

