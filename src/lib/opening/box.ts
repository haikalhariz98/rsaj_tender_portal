/**
 * The tender box at opening (OD-4, C-3, ADR 0017). A bid found in the box is registered at the main
 * opening, after the box is opened and before any envelope is opened (the box is emptied first). It is
 * in time by the box's LOCKED event — the server's stamp of the lock (6.6 CR-3), never an instant an
 * officer enters — not by the moment it is recorded: 6.6's "recorded after the closing is late"
 * governs envelopes an officer receives (OD-3); OD-4 is the specific rule for the box (C-3 a). Its
 * `receivedAt` is the lock's instant, an upper bound, labelled "in the box when it was locked",
 * never shown as a receipt time; `recordedAfterClosing` is stored true (C-3 b). Any gap between the
 * closing and the lock is a finding shown to the committee and frozen on the schedule, with no
 * tolerance (C-3 c). Pure.
 */

import { isLate, toSecond } from "@/lib/bids/lateness";
import type { EnvelopeKind, ReceiptSource } from "@/lib/bids/types";

import type { OpeningState } from "./state";
import { actFaults, type ActFault } from "./state";
import type { Finding } from "./types";

/// The closing-to-lock gap, to the second, in words ("12 min 10 s"). Null where the box was not locked after the closing.
export function lockGap(closing: Date, lockedAt: Date): { seconds: number; text: string } {
  const seconds = Math.max(0, Math.round((toSecond(lockedAt).getTime() - toSecond(closing).getTime()) / 1000));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const parts = [h ? `${h} h` : null, h || m ? `${m} min` : null, `${s} s`].filter(Boolean);
  return { seconds, text: parts.join(" ") };
}

/// C-3 c: the gap as a finding — always shown, never a tolerance. Zero says the box was locked at the closing second.
export function lockGapFinding(closing: Date, lockedAt: Date): Finding<"LOCK_GAP" | "LOCKED_AT_CLOSING"> {
  const g = lockGap(closing, lockedAt);
  return g.seconds === 0 ? { code: "LOCKED_AT_CLOSING", level: "info" } : { code: "LOCK_GAP", level: "warn", data: { gap: g.text, seconds: g.seconds } };
}

/// What a box envelope stores in 6.6's columns (C-3 b).
export function boxEnvelopeJudgement(lockedAt: Date, closing: Date) {
  return { receivedAt: toSecond(lockedAt), receivedSource: "BOX_AT_OPENING" as const, late: false, closingAtJudged: closing, recordedAfterClosing: true };
}

/**
 * Whether an envelope is in time, by its source: a box envelope by the lock (it is in time, whatever
 * the gap, which is a finding); every other by 6.6's flag, judged at receipt on the server's stamp.
 */
export function inTime(e: { receivedSource: ReceiptSource; late: boolean }): boolean {
  if (e.receivedSource === "BOX_AT_OPENING") return true;
  return !e.late;
}

/// The words beside an envelope's time, by its source (C-3 b): a box envelope's time is never a receipt time.
export const timeLabel = (source: ReceiptSource) => (source === "BOX_AT_OPENING" ? "In the box when it was locked" : source === "ENTERED" ? "Recorded after the event" : "Server-stamped");

export type RegisterFault = ActFault | "NOT_MAIN" | "BOX_EMPTIED" | "NOT_A_BID" | "MARKINGS_REQUIRED" | "PERSON_REQUIRED" | "NOT_LOCKED_AFTER_CLOSING";

export function registerBoxFaults(i: {
  state: OpeningState;
  /// An envelope has been opened at this opening: the box was emptied before that.
  anyOpened: boolean;
  kind: EnvelopeKind;
  markings: string;
  personActive: boolean;
  closing: Date | null;
  lockedAt: Date | null;
}): Finding<RegisterFault>[] {
  const out: Finding<RegisterFault>[] = [...actFaults(i.state)];
  const f = (code: RegisterFault) => out.push({ code, level: "block" });
  if (i.state.kind !== "MAIN") f("NOT_MAIN");
  if (i.anyOpened) f("BOX_EMPTIED");
  if (i.kind === "COMPANY_ESTIMATE") f("NOT_A_BID");
  if (!i.markings.trim()) f("MARKINGS_REQUIRED");
  if (!i.personActive) f("PERSON_REQUIRED");
  if (!i.closing || !i.lockedAt || isLate(i.closing, i.lockedAt)) f("NOT_LOCKED_AFTER_CLOSING");
  return out;
}
