/**
 * "Sent back": a requisition whose approval was rejected and returned to whoever raised
 * it. Its stored status goes back to Draft, which reads as though nothing had happened;
 * this is the display state that says it was sent back and why. Derived, never stored.
 */

import type { RequisitionStatus } from "./types";

export const SENT_BACK_LABEL = "Sent back — needs changes";

export interface RouteForSentBack {
  status: string;
  openedAt: Date;
  closedAt: Date | null;
  /// The destination the rejection applied, null while the officer has yet to choose.
  rejectionApplied: string | null;
  rejectionReason: string;
}

/**
 * The rejection that sent a requisition back, or null. It is sent back while it is a
 * Draft and its latest route was rejected with a return to the originator applied: a
 * later route (it was submitted again) or a later return at endorsement (it was sent on
 * and came back) means the rejection is no longer what is waiting on it.
 */
export function sentBackBy(
  status: RequisitionStatus,
  routes: readonly RouteForSentBack[],
  returnedOn: Date | null,
): { reason: string } | null {
  if (status !== "DRAFT") return null;
  const latest = [...routes].sort((a, b) => b.openedAt.getTime() - a.openedAt.getTime())[0];
  if (!latest || latest.status !== "REJECTED" || latest.rejectionApplied !== "RETURN_TO_ORIGINATOR") return null;
  if (returnedOn && latest.closedAt && returnedOn.getTime() > latest.closedAt.getTime()) return null;
  return { reason: latest.rejectionReason.trim() };
}
