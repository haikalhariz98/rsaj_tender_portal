/**
 * FR-BID-005: there is no edit path on an envelope. The one exception is a clerical correction
 * of the portal's custody record — the markings as written, the channel, the receiving officer —
 * before the closing, with a reason, audited before and after. The received instant, the sequence,
 * the late flag and the kind are never correctable, and after the closing nothing changes. This
 * corrects the record of the envelope, never the bid: the bid is a sealed paper envelope nobody
 * can amend. Pure.
 */

import { exerciseFaults, type ReceiptFault } from "./receipt";
import { isLate } from "./lateness";
import { OFFICER_CHANNELS, type EnvelopeChannel, type EnvelopeFacts, type ExerciseForBids, type Finding } from "./types";

/// The fields a correction may touch, and those it may never.
export const CORRECTABLE_FIELDS = ["markings", "channel", "receivedByPersonId"] as const;
export const IMMUTABLE_FIELDS = ["receivedAt", "sequence", "late", "kind", "statedReceivedAt", "closingAtJudged", "recordedAfterClosing", "partyId", "status"] as const;

export type CorrectionFault = ReceiptFault | "CORRECTION_CLOSED" | "REASON_REQUIRED" | "IMMUTABLE_FIELD" | "NOTHING_CHANGED" | "WITHDRAWN" | "NOT_A_BID";

export interface CorrectionChange {
  markings?: string;
  channel?: EnvelopeChannel;
  receivedByPersonId?: string;
  /// Anything else the form tried to send: refused by name.
  [field: string]: unknown;
}

export function correctionFaults(i: {
  exercise: ExerciseForBids;
  now: Date;
  envelope: Pick<EnvelopeFacts, "kind" | "status" | "channel"> & { markings: string; receivedByPersonId: string };
  change: CorrectionChange;
  reason: string;
  /// The officer named, where the change names one, is an active Person.
  personActive: boolean;
}): Finding<CorrectionFault>[] {
  const out: Finding<CorrectionFault>[] = exerciseFaults(i.exercise);
  const f = (code: CorrectionFault, data?: Finding["data"]) => out.push({ code, level: "block", ...(data ? { data } : {}) });
  const closing = i.exercise.closing;
  if (closing && isLate(i.now, closing)) f("CORRECTION_CLOSED");
  if (i.envelope.kind === "COMPANY_ESTIMATE") f("NOT_A_BID");
  if (i.envelope.status === "WITHDRAWN") f("WITHDRAWN");
  for (const field of Object.keys(i.change)) {
    if (!(CORRECTABLE_FIELDS as readonly string[]).includes(field)) f("IMMUTABLE_FIELD", { field });
  }
  const c = i.change;
  if (c.channel !== undefined && !OFFICER_CHANNELS.includes(c.channel)) f("CHANNEL_NOT_FOR_OFFICER");
  if (c.markings !== undefined && !c.markings.trim()) f("MARKINGS_REQUIRED");
  if (c.receivedByPersonId !== undefined && !i.personActive) f("PERSON_REQUIRED");
  const changed =
    (c.markings !== undefined && c.markings !== i.envelope.markings) ||
    (c.channel !== undefined && c.channel !== i.envelope.channel) ||
    (c.receivedByPersonId !== undefined && c.receivedByPersonId !== i.envelope.receivedByPersonId);
  if (!changed && !out.some((x) => x.code === "IMMUTABLE_FIELD")) f("NOTHING_CHANGED");
  if (!i.reason.trim()) f("REASON_REQUIRED");
  return out;
}
