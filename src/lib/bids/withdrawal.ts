/**
 * Withdrawals (FR-BID-004, X-11). A bidder's withdrawal letter received before the closing is its
 * own record: stamped by the server when recorded, its markings quoted, the letter attached
 * (SULIT). Where the envelope was received over the counter or by post it is named now and marked
 * withdrawn; one in the box is matched by 6.7 at opening, which refuses to open it. A withdrawn
 * envelope stays on the register and is never opened; it is handed back unopened, or held
 * unopened, with the day. After the closing a withdrawal is refused. Pure.
 */

import { exerciseFaults, type ReceiptFault } from "./receipt";
import { isLate } from "./lateness";
import type { EnvelopeFacts, ExerciseForBids, Finding } from "./types";

export type WithdrawFault = ReceiptFault | "AFTER_CLOSING" | "ALREADY_WITHDRAWN" | "NOT_A_BID" | "ENVELOPE_LATE";

export function withdrawFaults(i: {
  exercise: ExerciseForBids;
  now: Date;
  /// The envelope it withdraws, as read under the lock; null where it is in the box.
  envelope: (Pick<EnvelopeFacts, "kind" | "late" | "status"> & { withdrawn: boolean }) | null;
  markings: string;
  personActive: boolean;
}): Finding<WithdrawFault>[] {
  const out: Finding<WithdrawFault>[] = exerciseFaults(i.exercise);
  const f = (code: WithdrawFault, data?: Finding["data"]) => out.push({ code, level: "block", ...(data ? { data } : {}) });
  const closing = i.exercise.closing;
  if (closing && isLate(i.now, closing)) f("AFTER_CLOSING");
  if (i.envelope) {
    if (i.envelope.kind === "COMPANY_ESTIMATE") f("NOT_A_BID");
    // A late envelope arrived after the closing, so it can only be withdrawn after it.
    else if (i.envelope.late) f("ENVELOPE_LATE");
    if (i.envelope.withdrawn || i.envelope.status === "WITHDRAWN") f("ALREADY_WITHDRAWN");
  }
  if (!i.markings.trim()) f("MARKINGS_REQUIRED");
  if (!i.personActive) f("PERSON_REQUIRED");
  return out;
}

export type ReturnFault = "NOT_WITHDRAWN" | "ALREADY_RETURNED" | "TIME_ZONE_UNSET" | "DAY_IN_FUTURE" | "BEFORE_WITHDRAWAL" | "CANCELLED";

/// Recording that a withdrawn envelope was handed back unopened, on a day not after today and not before the withdrawal.
export function returnFaults(i: { envelope: Pick<EnvelopeFacts, "status" | "returnedUnopenedOn">; withdrawnOn: string | null; day: string; today: string | null; cancelled: boolean }): Finding<ReturnFault>[] {
  const out: Finding<ReturnFault>[] = [];
  const f = (code: ReturnFault) => out.push({ code, level: "block" });
  if (i.cancelled) f("CANCELLED");
  if (i.envelope.status !== "WITHDRAWN") f("NOT_WITHDRAWN");
  if (i.envelope.returnedUnopenedOn) f("ALREADY_RETURNED");
  if (!i.today) f("TIME_ZONE_UNSET");
  else if (i.day > i.today) f("DAY_IN_FUTURE");
  if (i.withdrawnOn && i.day < i.withdrawnOn) f("BEFORE_WITHDRAWAL");
  return out;
}

/// Where a withdrawn envelope is: handed back on a day, or held unopened.
export const returnState = (e: Pick<EnvelopeFacts, "status" | "returnedUnopenedOn">): "NOT_WITHDRAWN" | "HELD_UNOPENED" | "RETURNED_UNOPENED" =>
  e.status !== "WITHDRAWN" ? "NOT_WITHDRAWN" : e.returnedUnopenedOn ? "RETURNED_UNOPENED" : "HELD_UNOPENED";
