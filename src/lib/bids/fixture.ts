/**
 * Test fixtures for the bid-receipt rules. Invented; never seeded, never loaded by the demo.
 * The closing is the plan's worked example: 17 Nov 2026, 14:30 in Kuala Lumpur (06:30 UTC).
 */

import type { EnvelopeFacts, ExerciseForBids } from "./types";

export const TZ = "Asia/Kuala_Lumpur";
export const CLOSING = new Date("2026-11-17T06:30:00.000Z");
export const PUBLISHED = new Date("2026-10-20T01:00:00.000Z");
/// A second, in milliseconds.
export const S = 1000;

export const exercise = (over: Partial<ExerciseForBids> = {}): ExerciseForBids => ({
  status: "ADVERTISED",
  closing: CLOSING,
  publishedAt: PUBLISHED,
  timeZone: TZ,
  openingStarted: false,
  ...over,
});

let n = 0;
export const envelope = (over: Partial<EnvelopeFacts> = {}): EnvelopeFacts => {
  n += 1;
  return {
    id: `e${n}`,
    sequence: n,
    kind: "BID",
    channel: "COUNTER",
    receivedAt: new Date(CLOSING.getTime() - 3600 * S),
    receivedSource: "SERVER",
    statedReceivedAt: null,
    late: false,
    closingAtJudged: CLOSING,
    recordedAfterClosing: false,
    status: "RECEIVED",
    parentEnvelopeId: null,
    returnedUnopenedOn: null,
    ...over,
  };
};
