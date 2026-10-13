/**
 * The vocabulary of bid receipt (spec §6.6, §7.1), as pure types. Mirrors the Prisma enums so
 * `src/lib/bids/**` stays free of the client, as the other lib modules do. Every rule about the
 * envelope register lives beside this file; actions and screens call it and never restate it.
 *
 * The register records envelopes, never offers (ADR 0016): nothing here has a price, a sum, a
 * period, a score or a document's content, and `sealed.test.ts` keeps it that way.
 *
 * Nothing here is policy: the late-admission committee, the minimum number of bids, the
 * completeness consequence, the validity days and the alert offsets are the customer's
 * configuration, shipped empty. Unset is "not set", never zero and never a default.
 */

import type { ExerciseStatus } from "@/lib/method/types";

export type { ExerciseStatus };

export type Level = "block" | "warn" | "info";

export interface Finding<C extends string = string> {
  code: C;
  level: Level;
  /// Values the words are written with (labels, days as YYYY-MM-DD, counts).
  data?: Record<string, string | number | null>;
}

export const blocking = <C extends string>(fs: readonly Finding<C>[]) => fs.filter((f) => f.level === "block");

export type EnvelopeKind = "BID" | "ALTERNATIVE" | "COMPANY_ESTIMATE";
export const ENVELOPE_KINDS: readonly EnvelopeKind[] = ["BID", "ALTERNATIVE", "COMPANY_ESTIMATE"];
/// The kinds an officer records at receipt; the estimate is lodged by 6.2's act (`recordEstimateLodgement`).
export const RECEIPT_KINDS: readonly EnvelopeKind[] = ["BID", "ALTERNATIVE"];

/// Wave 3b (SR-13, ADR 0036 D12) adds ONLINE: submitted through the supplier portal, sealed. No officer receives it, and its stamp is the database's.
export type EnvelopeChannel = "COUNTER" | "POST" | "COURIER" | "BOX" | "ONLINE";
export const ENVELOPE_CHANNELS: readonly EnvelopeChannel[] = ["COUNTER", "POST", "COURIER", "BOX", "ONLINE"];
/// The channels an officer records a receipt through. A bid in the box is registered at opening (6.7, OD-4).
export const OFFICER_CHANNELS: readonly EnvelopeChannel[] = ["COUNTER", "POST", "COURIER"];

/// 6.7 adds BOX_AT_OPENING: a bid found in the box at opening, timed by the box's LOCKED event (C-3).
/// Wave 3b (SR-13, ADR 0036 D5, H2) adds PORTAL: an online submission, stamped by the database clock when the supplier submitted.
export type ReceiptSource = "SERVER" | "ENTERED" | "BOX_AT_OPENING" | "PORTAL";
/// 6.7 adds OPENED: opened at an opening; its offer is on 6.7's OpenedBid, never on the envelope.
/// Wave 3b (SR-13, ADR 0036 D7) adds SUPERSEDED: an online submission replaced by the same supplier's later one before the closing. ONLINE only (CHECK).
export type EnvelopeStatus = "RECEIVED" | "WITHDRAWN" | "OPENED" | "SUPERSEDED";
export type BoxEventKind = "LOCKED" | "UNLOCKED_FOR_OPENING";

/// An envelope as the rules read it.
export interface EnvelopeFacts {
  id: string;
  sequence: number;
  kind: EnvelopeKind;
  channel: EnvelopeChannel;
  /// The server's stamp, to the second.
  receivedAt: Date;
  receivedSource: ReceiptSource;
  statedReceivedAt: Date | null;
  late: boolean;
  closingAtJudged: Date | null;
  recordedAfterClosing: boolean;
  status: EnvelopeStatus;
  parentEnvelopeId: string | null;
  returnedUnopenedOn: Date | null;
}

/// The exercise as a receipt act reads it, on locked rows.
export interface ExerciseForBids {
  status: ExerciseStatus;
  /// Null: no closing set.
  closing: Date | null;
  /// When the window was published (6.5); null where it was not published through 6.5.
  publishedAt: Date | null;
  /// The organisation's zone; null while not set.
  timeZone: string | null;
  /// The box has been opened for opening (6.7): the register is then 6.7's.
  openingStarted: boolean;
}

/// Whether the exercise is published (advertised or invited), the only states a bid is received in.
/// 6.7 (X-8): the opening's two states follow publication, so they read as published here too.
/// 6.8 (X-8): so do the evaluation's two.
export const isPublishedStatus = (s: ExerciseStatus) => s === "ADVERTISED" || s === "INVITED" || s === "OPENING_IN_PROGRESS" || s === "OPENED" || s === "UNDER_EVALUATION" || s === "EVALUATED";
