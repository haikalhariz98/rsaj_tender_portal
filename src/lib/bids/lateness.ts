/**
 * FR-BID-002, 003: lateness, judged only against the closing instant, to the second, on the
 * server's clock. There is no client time here: the function takes the server's stamp and the
 * closing, and nothing else (OD-3 amended: the server stamp alone decides).
 *
 * The reading (ASSUMED, shown on the tab): an envelope recorded in the closing second itself
 * is in time, and from the next second it is late — closing 14:30, 14:30:00 in time, 14:30:01
 * late. Fractions of a second are dropped, never rounded up: 14:30:00.900 is 14:30:00. The window's
 * phase (window/phase.ts) reads CLOSED from 14:30:00 itself; closing-instant.test.ts pins both.
 */

/// An instant truncated to the whole second (fractions dropped).
export function toSecond(at: Date): Date {
  return new Date(Math.floor(at.getTime() / 1000) * 1000);
}

/// Whether an envelope stamped at `receivedAt` is late for a closing at `closing`.
export function isLate(receivedAt: Date, closing: Date): boolean {
  return toSecond(receivedAt).getTime() > toSecond(closing).getTime();
}

/// The reading the screen shows beside the late flag, with where it came from.
export const LATENESS_READING = {
  text: "Judged on the server's clock to the second: an envelope recorded in the closing second is in time; from the next second it is late. Fractions of a second are dropped.",
  provenance: "ASSUMED" as const,
};
