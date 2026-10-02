/**
 * The company estimate's lodgement into the box (6.2 FR-EST-010, 6.6 plan §2). Copy 1 of the
 * estimate goes into the tender box with the bids: its lodgement is recorded on the register as a
 * COMPANY_ESTIMATE envelope, which is never a bid and never counted. It is written by its own
 * helper, never through a receipt: an estimate may be lodged in preparation, before publication,
 * so the window's faults are not asked. It is refused only after the closing and on a cancelled
 * exercise. Estimates lodged before the register existed have no envelope, and none is made for
 * them: 6.7 reads 6.2's own LODGED custody event. Pure.
 */

import { isLate, toSecond } from "./lateness";
import type { ExerciseStatus, Finding } from "./types";

export type LodgementFault = "CANCELLED" | "LODGEMENT_CLOSED";

export function lodgementFaults(i: { status: ExerciseStatus; closing: Date | null; now: Date }): Finding<LodgementFault>[] {
  if (i.status === "CANCELLED") return [{ code: "CANCELLED", level: "block" }];
  if (i.closing && isLate(i.now, i.closing)) return [{ code: "LODGEMENT_CLOSED", level: "block" }];
  return [];
}

/// What the lodgement's envelope stores. Never late: a lodgement after the closing is refused.
export function judgeLodgement(now: Date, closing: Date | null) {
  return { receivedAt: toSecond(now), late: false, recordedAfterClosing: false, closingAtJudged: closing };
}

/// The markings the register shows for a lodgement: the estimate's version, never its figure.
export const lodgementMarkings = (versionNo: number) => `Company estimate, copy 1 (version ${versionNo}), sealed`;
