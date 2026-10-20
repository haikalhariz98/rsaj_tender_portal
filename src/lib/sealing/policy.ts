/**
 * The bid sealing policy as an editor saves it (ADR 0036 D1, rulings 20i, 20o, 20v; build plan step 7). Pure.
 *
 * A recorded reference carries the day it was recorded, and an attestation the person who attested and the day. Both are the product's to set, never typed: a
 * reference that changes is stamped now, one that is cleared loses its stamp, and one that is saved unchanged keeps the stamp it has.
 */

import { liveIssueFaults, type LiveIssueFault } from "./switch";
import type { OnlineSubmissionMode } from "@/lib/bids/online/types";
import type { ExerciseStatus } from "@/lib/method/types";
import { isPublished } from "@/lib/window/phase";

/// The stamp a recorded text takes when it is saved: unchanged keeps its stamp, cleared loses it, changed takes `now`. Spaces only is cleared.
export function stampFor(before: { text: string; at: Date | null }, afterText: string, now: Date): Date | null {
  const text = afterText.trim();
  if (!text) return null;
  if (text === before.text.trim() && before.at) return before.at;
  return now;
}

/// An attestation: the same stamp, and the person who attested. Unchanged keeps both; changed takes `now` and `by`; cleared loses both.
export function attestationFor(before: { text: string; at: Date | null; byPersonId: string | null }, afterText: string, now: Date, by: string): { at: Date | null; byPersonId: string | null } {
  const at = stampFor(before, afterText, now);
  if (!at) return { at: null, byPersonId: null };
  const kept = afterText.trim() === before.text.trim() && before.at != null;
  return { at, byPersonId: kept ? before.byPersonId : by };
}

/// Saving the policy at LIVE needs every condition for LIVE (must-haves 1 to 8, and the database login's two walls, N6). Any other mode, or none, is never refused for them.
export function sealingPolicyFaults(i: { mode: OnlineSubmissionMode | null; live: Parameters<typeof liveIssueFaults>[0] }): LiveIssueFault[] {
  return i.mode === "LIVE" ? liveIssueFaults(i.live) : [];
}

export const SEALING_MODE_WORDS: Readonly<Record<OnlineSubmissionMode | "NOT_SET", string>> = {
  NOT_SET: "Not set",
  DEMONSTRATION: "Demonstration: bids taken online are for trying the system, not for real tenders",
  LIVE: "Live: bids taken online are real",
};

export const sealingModeWords = (m: OnlineSubmissionMode | null): string => SEALING_MODE_WORDS[m ?? "NOT_SET"];

/// What a withdrawn LIVE leaves running (ADR 0036 D1, ruling 20i): the published ONLINE exercises that still take bids. A late bid is taken until the main opening
/// starts (20b), so an exercise past its closing still counts until then. A cancelled exercise takes none.
export function exercisesStillTakingBids<T extends { status: string; channel: string | null; mainOpeningStarted: boolean }>(rows: readonly T[]): T[] {
  return rows.filter((r) => r.channel === "ONLINE" && isPublished(r.status as ExerciseStatus) && !r.mainOpeningStarted);
}
