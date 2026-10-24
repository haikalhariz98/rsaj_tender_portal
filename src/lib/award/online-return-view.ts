/**
 * What the Award stage's Return tab shows of a return sent online and of the contractor's questions (wave V step V5). Pure: the panel loads rows and asks these, so what is
 * offered (Verify, Refuse, Answer) is the library's own rule (`verifyFaults`, `refuseFaults`, `answerFaults`) and not a second reading of it.
 */

import { answerFaults, onlineReturnState, refuseFaults, verifyFaults, type OnlineReturnState } from "./online-return";

/// The state in words. Nothing says "none": a card is drawn only for a return that exists.
export const ONLINE_STATE_LABEL: Readonly<Record<Exclude<OnlineReturnState, "NONE">, { text: string; tone: "warn" | "ok" | "err" }>> = {
  WAITING: { text: "Waiting to be verified", tone: "warn" },
  VERIFIED: { text: "Verified", tone: "ok" },
  REFUSED: { text: "Refused", tone: "err" },
};

/// What the officer reads when nobody would be told of a return lodged online or a question (AC-42, WV-8): no rule names an office, and no person in charge is named and active.
export const NOBODY_TOLD = "No notification rule names who is told.";

export const nobodyToldLine = (plan: { recipientIds: readonly string[] }): string | null => (plan.recipientIds.length === 0 ? NOBODY_TOLD : null);

/// The cancel confirm's refusal while a return waits (WV-4), naming the return and its day. `day` is formatted by the caller.
export const cancelWaitingNote = (day: string) => `The contractor sent the signed return online on ${day}. Verify or refuse it first: an award is not cancelled while its return waits.`;

export interface OnlineReturnRowFacts {
  id: string;
  submittedAt: Date;
  verifiedAt: Date | null;
  refusedAt: Date | null;
}

export interface OnlineReturnCardFacts {
  state: Exclude<OnlineReturnState, "NONE">;
  /// The latest row: the one the card is about. Earlier refused rows are history, not shown.
  latest: string;
  verify: { offered: boolean; blocker: string | null };
  refuse: boolean;
}

/**
 * The card for the award's latest online return, or null when none was ever sent. Verify is offered while the return waits; it is blocked, with the reason, for an award that is
 * not issued and for a reader the identity card number is withheld from (the verify act writes it, so it needs the same SULIT right as the paper return). Refuse is offered
 * whenever the return waits.
 */
export function onlineReturnCardFacts(rows: readonly (OnlineReturnRowFacts)[], i: { awardStatus: string; sulitWithheldWords: string | null }): OnlineReturnCardFacts | null {
  const state = onlineReturnState(rows);
  if (state === "NONE") return null;
  const latest = rows.reduce((a, b) => (b.submittedAt.getTime() > a.submittedAt.getTime() ? b : a));
  const notIssued = verifyFaults({ awardStatus: i.awardStatus, state: "WAITING" }).length > 0;
  return {
    state,
    latest: latest.id,
    verify: { offered: state === "WAITING", blocker: state !== "WAITING" ? null : notIssued ? "Only an issued award's return is verified." : i.sulitWithheldWords },
    refuse: refuseFaults({ state, reason: "x" }).length === 0,
  };
}

/// Whether a question is offered the Answer action: answered once, in any status of the award (WV-7).
export const canAnswer = (q: { answeredAt: Date | null }): boolean => answerFaults({ answeredAt: q.answeredAt, answer: "x" }).length === 0;
