/**
 * OD-4, BD-67-8 as ruled (review S-3, R-4): what follows from a bid by a bidder with no live purchase
 * (or not invited), as an opening reads it. Frozen at the start; where it was not set then but the
 * method sets it since, it is recorded on the opening once, the first time a verdict needs it — with
 * when and by whom, audited in the same transaction — and from then on the opening says so wherever
 * the rule is shown (the Opening section, the frozen schedule, the print). Pure.
 */

import { receiptTime } from "@/lib/bids/labels";

import { UNPURCHASED_LABEL } from "./labels";
import type { OpeningPolicySnapshot } from "./policy";
import type { Provenance, UnpurchasedConsequence } from "./types";

export interface LiveUnpurchased {
  consequence: UnpurchasedConsequence | null;
  provenance: Provenance | null;
}

/// The rule to judge with, and the snapshot to write where it is recorded now (null: nothing to record).
export function unpurchasedRule(snap: OpeningPolicySnapshot, live: LiveUnpurchased | null, at: Date, by: string): { consequence: UnpurchasedConsequence | null; record: OpeningPolicySnapshot | null } {
  if (snap.unpurchased.consequence) return { consequence: snap.unpurchased.consequence, record: null };
  const consequence = live?.consequence ?? null;
  if (!consequence) return { consequence: null, record: null };
  return { consequence, record: { ...snap, unpurchased: { consequence, provenance: live?.provenance ?? null, recordedLater: true, recordedAt: at.toISOString(), recordedBy: by } } };
}

/// The audit pair for recording it on the opening.
export function unpurchasedRecordAudit(consequence: UnpurchasedConsequence, at: Date, by: string, tz: string | null) {
  return {
    before: { unpurchasedBidRule: "Not set when the opening started" },
    after: { unpurchasedBidRule: `${UNPURCHASED_LABEL[consequence]} (set on the method since the opening started; recorded on this opening ${receiptTime(at, tz)} by ${by}, on their behalf, not signed)` },
  };
}

/**
 * The rule in words, wherever the opening shows it (S-3). Recorded later: says so, with when and by
 * whom, for as long as the record stands — read from `recordedLater`, never from whether a
 * consequence is frozen. Set on the method since but not yet recorded: says it will be, when first
 * needed. Unset: "Not set".
 */
export function unpurchasedRuleText(snap: OpeningPolicySnapshot, live: UnpurchasedConsequence | null, tz: string | null): string {
  const u = snap.unpurchased;
  if (u.consequence && u.recordedLater) {
    const when = u.recordedAt ? receiptTime(new Date(u.recordedAt), tz) : "a time not recorded";
    return `${UNPURCHASED_LABEL[u.consequence]} (set since the opening started; recorded on this opening ${when}${u.recordedBy ? ` by ${u.recordedBy}` : ""})`;
  }
  if (u.consequence) return UNPURCHASED_LABEL[u.consequence];
  if (live) return `${UNPURCHASED_LABEL[live]} (set since the opening started; recorded on this opening when a verdict first needs it)`;
  return "Not set";
}
