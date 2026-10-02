/**
 * Recording an envelope's receipt (FR-BID-002, 003, 006; OD-3 as amended by the product owner).
 *
 * The officer records a receipt; the server stamps it, to the second, inside the transaction, and
 * that stamp alone decides lateness against the closing on the locked exercise. Where the receipt
 * is recorded after the event, the officer also states when it was received, with a reason: the
 * stated time is shown to the committee beside the stamp, as the officer's statement,
 * and never judged. Anything recorded after the closing is late; the committee decides admission.
 *
 * A late envelope is recorded, flagged, counted and segregated, never refused for being late: no
 * rule here refuses a receipt because of the time. Pure.
 */

import { isLate, toSecond } from "./lateness";
import { isPublishedStatus, OFFICER_CHANNELS, RECEIPT_KINDS, type EnvelopeChannel, type EnvelopeKind, type EnvelopeStatus, type ExerciseForBids, type Finding } from "./types";

export type ReceiptFault =
  | "TIME_ZONE_UNSET"
  | "CLOSING_NOT_SET"
  | "NOT_PUBLISHED"
  | "CANCELLED"
  | "AFTER_OPENING"
  | "PERSON_REQUIRED"
  | "MARKINGS_REQUIRED"
  | "CHANNEL_NOT_FOR_OFFICER"
  | "KIND_NOT_FOR_RECEIPT"
  | "ENTERED_NOT_BEFORE_RECORDING"
  | "BEFORE_WINDOW"
  | "REASON_REQUIRED"
  | "PARENT_NOT_A_BID"
  | "PARENT_ONLY_FOR_ALTERNATIVE"
  | "RECORDED_AFTER_CLOSING"
  | "STATED_BEFORE_CLOSING";

/// Where the exercise stands for any register act: published, not cancelled, a closing and a zone set, not opened.
export function exerciseFaults(x: ExerciseForBids): Finding<ReceiptFault>[] {
  const out: Finding<ReceiptFault>[] = [];
  if (x.status === "CANCELLED") return [{ code: "CANCELLED", level: "block" }];
  if (!isPublishedStatus(x.status)) out.push({ code: "NOT_PUBLISHED", level: "block" });
  if (!x.timeZone) out.push({ code: "TIME_ZONE_UNSET", level: "block" });
  if (!x.closing) out.push({ code: "CLOSING_NOT_SET", level: "block" });
  if (x.openingStarted) out.push({ code: "AFTER_OPENING", level: "block" });
  return out;
}

export interface ReceiptInput {
  exercise: ExerciseForBids;
  kind: EnvelopeKind;
  channel: EnvelopeChannel;
  markings: string;
  /// The receiving officer is an active Person (recorded on their behalf, not signed).
  personActive: boolean;
  /// The server's clock now, read inside the transaction.
  now: Date;
  /// Recorded after the event: the time the officer states it was received, and why it is recorded late.
  stated: { at: Date; reason: string } | null;
  /// The parent an alternative names, as read under the lock. Undefined: none named. Null: not found.
  parent?: { kind: EnvelopeKind; status: EnvelopeStatus } | null;
}

export function receiptFaults(i: ReceiptInput): Finding<ReceiptFault>[] {
  const out = exerciseFaults(i.exercise);
  const f = (code: ReceiptFault, level: Finding["level"] = "block", data?: Finding["data"]) => out.push({ code, level, ...(data ? { data } : {}) });
  if (!RECEIPT_KINDS.includes(i.kind)) f("KIND_NOT_FOR_RECEIPT");
  if (!OFFICER_CHANNELS.includes(i.channel)) f("CHANNEL_NOT_FOR_OFFICER");
  if (!i.markings.trim()) f("MARKINGS_REQUIRED");
  if (!i.personActive) f("PERSON_REQUIRED");
  if (i.parent !== undefined) {
    if (i.kind !== "ALTERNATIVE") f("PARENT_ONLY_FOR_ALTERNATIVE");
    else if (i.parent == null || i.parent.kind !== "BID") f("PARENT_NOT_A_BID");
  }
  if (i.stated) {
    if (!i.stated.reason.trim()) f("REASON_REQUIRED");
    if (toSecond(i.stated.at).getTime() >= toSecond(i.now).getTime()) f("ENTERED_NOT_BEFORE_RECORDING");
    if (i.exercise.publishedAt && i.stated.at.getTime() < i.exercise.publishedAt.getTime()) f("BEFORE_WINDOW");
  }
  // Said, never refused: the committee sees it and decides.
  const closing = i.exercise.closing;
  if (closing && isLate(i.now, closing)) {
    f("RECORDED_AFTER_CLOSING", "warn");
    if (i.stated && !isLate(i.stated.at, closing)) f("STATED_BEFORE_CLOSING", "warn");
  }
  return out;
}

/**
 * What a receipt stores, judged on the server's stamp and the locked closing: the stamp to the
 * second, whether it is late, and the closing it was judged against (a snapshot, so a later
 * closing change never re-judges it). Call only once `receiptFaults` has no block.
 */
export function judgeReceipt(now: Date, closing: Date) {
  const late = isLate(now, closing);
  return { receivedAt: toSecond(now), late, recordedAfterClosing: late, closingAtJudged: closing };
}
