/**
 * Whether the company estimate is lodged, and what lodging it again takes, on each channel (ADR 0036 D10, D11; rulings 20g, 20bm; wave 3b step 16). Pure.
 *
 * On PAPER the estimate is lodged when its state says so. ONLINE it is lodged only while an unsuperseded sealed copy stands under the exercise's LIVE key: a key that was
 * retired for any reason (a re-key, a roster change before publication) takes its lodgement with it, and the lodging officer lodges the same version again by their own act, with a
 * reason. The server never does it from the retained copy. Never a figure here.
 */

import { isLate } from "@/lib/bids/lateness";
import type { Finding } from "@/lib/scope/types";

export type Channel = "PAPER" | "ONLINE" | null;

/// The unsuperseded sealed copy of the exercise, as the rules see it.
export interface StandingLodgement { keyId: string; versionNo: number; lodgedByPersonId: string }

/// Whether the estimate counts as lodged, for the start and the screens. A channel not yet chosen reads as paper: nothing is sealed.
export const estimateLodgedOn = (i: { channel: Channel; state: string | null; liveKeyId: string | null; standing: StandingLodgement | null }): boolean =>
  i.state === "LODGED" && (i.channel !== "ONLINE" || (i.liveKeyId != null && i.standing != null && i.standing.keyId === i.liveKeyId));

/// The estimate's state as the start judges it: a lodged state whose sealed copy does not stand under the live key reads as none, on every path that starts or pre-checks an opening.
export const estimateStateForStart = <S extends string>(i: { channel: Channel; state: S | null; liveKeyId: string | null; standing: StandingLodgement | null }): S | null =>
  i.state === "LODGED" && !estimateLodgedOn(i) ? null : i.state;

/// Whether a lodged estimate's sealed copy is missing under the live key, so that lodging the same version again is open. False on paper, and when nothing is lodged.
export const needsRelodgement = (i: { channel: Channel; state: string | null; liveKeyId: string | null; standing: StandingLodgement | null }): boolean =>
  i.channel === "ONLINE" && i.state === "LODGED" && !estimateLodgedOn(i);

export type SealedLodgementFault = "SEALED_KEY_NOT_READY" | "RELODGE_REASON_REQUIRED" | "NOT_LODGING_OFFICER" | "LODGEMENT_CLOSED";

/**
 * The online half of lodging. `again` is a lodgement of the version already lodged (the sealed copy being missing under the live key); `lodgingOfficerId` is whoever lodged that
 * version last (null where none is recorded). A new version needs neither reason nor the same officer: it is judged as any lodgement is.
 */
export function sealedLodgementFaults(i: { liveKeyId: string | null; again: boolean; reason: string; personId: string | null; lodgingOfficerId: string | null; closing: Date | null; now: Date }): Finding<SealedLodgementFault>[] {
  const out: Finding<SealedLodgementFault>[] = [];
  // The same second the database's trigger judges: the closing second is in time.
  if (i.closing && isLate(i.now, i.closing)) return [{ code: "LODGEMENT_CLOSED", level: "block" }];
  if (i.liveKeyId == null) out.push({ code: "SEALED_KEY_NOT_READY", level: "block" });
  if (i.again) {
    if (!i.reason.trim()) out.push({ code: "RELODGE_REASON_REQUIRED", level: "block" });
    if (i.lodgingOfficerId != null && i.personId != null && i.lodgingOfficerId !== i.personId) out.push({ code: "NOT_LODGING_OFFICER", level: "block" });
  }
  return out;
}

export const SEALED_LODGEMENT_WORDS: Readonly<Record<SealedLodgementFault, string>> = {
  SEALED_KEY_NOT_READY: "This exercise's sealing key does not exist yet, so the estimate cannot be sealed into the online box. Every named opening officer sets their own share first, under Scope and estimate, Opening officers.",
  RELODGE_REASON_REQUIRED: "Say why the estimate is lodged again. The key it was sealed under has changed, so the copy sealed under it can no longer be opened.",
  NOT_LODGING_OFFICER: "The same officer who lodged this version lodges it again. The server never does it for them.",
  LODGEMENT_CLOSED: "The closing has passed, so the estimate can no longer go into the box.",
};
