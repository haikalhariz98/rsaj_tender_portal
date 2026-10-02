/**
 * What the register's audit rows say, in words (AGENTS.md rules 4 and 5): instants on the
 * organisation's clock, days as the screens write them, every enum by its label, never a code or
 * an id. The actions write these with their audit rows, in the same transaction; the exercise's
 * History renders them as written. Every row's label starts with the exercise's reference, so its
 * History finds it. Pure.
 */

import { storedDay } from "@/lib/dates";
import { formatDate, formatOrgDateTime } from "@/lib/format";

import { CHANNEL_LABEL, ENVELOPE_KIND_LABEL, ENVELOPE_STATUS_LABEL, receiptTime, SOURCE_LABEL } from "./labels";
import type { EnvelopeChannel, EnvelopeKind, EnvelopeStatus, ReceiptSource } from "./types";

/// The entity names the register's rows are audited under.
export const BID_ENTITY = {
  envelope: "BidEnvelope",
  withdrawal: "BidWithdrawal",
  box: "BoxEvent",
  extension: "ValidityExtension",
} as const;

/// Every register entity, for the History's and the demo wipe's lists.
export const BID_ENTITIES: readonly string[] = Object.values(BID_ENTITY);

const at = (d: Date | null | undefined, tz: string | null) => (d ? formatOrgDateTime(d, tz) : null);
/// A receipt, a letter or the box's lock, to the second (lateness is judged to the second).
const stamp = (d: Date | null | undefined, tz: string | null) => (d ? receiptTime(d, tz) : null);
const day = (d: Date | null | undefined) => (d ? formatDate(storedDay(d)) : null);

/// An envelope as the trail records it at receipt.
export function envelopeFields(e: {
  sequence: number;
  kind: EnvelopeKind;
  channel: EnvelopeChannel;
  receivedAt: Date;
  receivedSource: ReceiptSource;
  statedReceivedAt: Date | null;
  entryReason: string;
  markings: string;
  receivedBy: string;
  late: boolean;
  closingAtJudged: Date | null;
  parentSequence: number | null;
}, tz: string | null) {
  return {
    envelope: `Envelope ${e.sequence}`,
    kind: ENVELOPE_KIND_LABEL[e.kind],
    channel: CHANNEL_LABEL[e.channel],
    received: stamp(e.receivedAt, tz),
    stamp: SOURCE_LABEL[e.receivedSource],
    statedReceived: stamp(e.statedReceivedAt, tz),
    whyRecordedLater: e.entryReason || null,
    markings: e.markings,
    receivedBy: `${e.receivedBy} (recorded on their behalf, not signed)`,
    timeliness: e.late ? "Late" : "In time",
    judgedAgainstClosing: at(e.closingAtJudged, tz),
    alternativeTo: e.parentSequence != null ? `Envelope ${e.parentSequence}` : null,
  };
}

/// A correction's before or after: only the fields a correction touches.
export const correctionFields = (e: { channel: EnvelopeChannel; markings: string; receivedBy: string }) => ({ channel: CHANNEL_LABEL[e.channel], markings: e.markings, receivedBy: e.receivedBy });

export const statusField = (s: EnvelopeStatus) => ({ status: ENVELOPE_STATUS_LABEL[s] });

export function withdrawalFields(w: { receivedAt: Date; markings: string; receivedBy: string; envelopeSequence: number | null }, tz: string | null) {
  return {
    received: stamp(w.receivedAt, tz),
    stamp: SOURCE_LABEL.SERVER,
    /// The letter's own words identifying the envelope: SULIT, under its own key so History chips it
    /// (6.6 CR-4), never "markings", which envelope corrections share.
    letterQuote: w.markings,
    receivedBy: `${w.receivedBy} (recorded on their behalf, not signed)`,
    envelope: w.envelopeSequence != null ? `Envelope ${w.envelopeSequence}` : "In the tender box: matched at opening",
  };
}

export const returnFields = (r: { returnedUnopenedOn: Date; note: string }) => ({ returnedUnopened: day(r.returnedUnopenedOn), note: r.note || null });

export const boxFields = (b: { at: Date; by: string; note: string }, tz: string | null) => ({ boxLocked: stamp(b.at, tz), lockedBy: `${b.by} (recorded on their behalf, not signed)`, note: b.note || null });

export function extensionFields(x: { fromExpiry: Date; toExpiry: Date; reason: string; consentParty: string; consentReceivedOn: Date; recordedBy: string }) {
  return {
    expiryFrom: day(x.fromExpiry),
    expiryTo: day(x.toExpiry),
    reason: x.reason,
    consentOf: `${x.consentParty} (named by the officer as the recommended tenderer, not yet checked against an evaluation)`,
    consentReceivedOn: day(x.consentReceivedOn),
    recordedBy: `${x.recordedBy} (recorded on their behalf, not signed)`,
  };
}

export const appliedFields = (appliedAt: Date, tz: string | null) => ({ applied: at(appliedAt, tz) });

export const bidAnswerFields = (w: { bidValidityDays: number | null; bidValidityProvenance: string | null; alternativesPermitted: boolean | null }) => ({
  bidValidity: w.bidValidityDays == null ? "Not set" : `${w.bidValidityDays} day${w.bidValidityDays === 1 ? "" : "s"}`,
  bidValiditySource: w.bidValidityProvenance == null ? null : w.bidValidityProvenance === "STATED" ? "Stated" : w.bidValidityProvenance === "OBSERVED" ? "Observed" : "Assumed",
  alternatives: w.alternativesPermitted == null ? "Not stated" : w.alternativesPermitted ? "Permitted" : "Not permitted",
});
