/**
 * Substituting a named officer on an online exercise (ADR 0036 D11, ruling 11; build plan §1.3). Pure.
 *
 * Before the documents are submitted the roster is an ordinary edit (FREE), and a change retires the key; there is nothing to substitute. From submission to the
 * closing a change is CONTROLLED, and the share moves: the incoming officer first sets their own key, then the departing officer releases their share to it, with
 * their passphrase, which nobody else holds. At or after the closing the roster does not change (REFUSED), and the exercise must be re-tendered.
 */

import type { RosterChange } from "@/lib/opening/roster";

export type SubstitutionFault = "NOT_CONTROLLED" | "INCOMING_KEY_NOT_SET" | "DEPARTING_MUST_RELEASE" | "AFTER_CLOSING_RETENDER";

// src/lib/sealing/substitution.ts (D11)
export function substitutionFaults(i: { change: RosterChange; incomingHasKey: boolean; departingIsActor: boolean; keyLive: boolean }): ("NOT_CONTROLLED" | "INCOMING_KEY_NOT_SET" | "DEPARTING_MUST_RELEASE" | "AFTER_CLOSING_RETENDER")[] {
  if (i.change === "REFUSED") return ["AFTER_CLOSING_RETENDER"];
  if (i.change === "FREE") return ["NOT_CONTROLLED"];
  const out: SubstitutionFault[] = [];
  if (!i.incomingHasKey) out.push("INCOMING_KEY_NOT_SET");
  if (i.keyLive && !i.departingIsActor) out.push("DEPARTING_MUST_RELEASE");
  return out;
}

export const SUBSTITUTION_WORDS: Readonly<Record<SubstitutionFault, string>> = {
  NOT_CONTROLLED: "Before the documents are submitted the roster is changed directly, and the key is set again; there is no share to transfer.",
  INCOMING_KEY_NOT_SET: "The incoming officer must set their own share first.",
  DEPARTING_MUST_RELEASE: "Only the departing officer can release their share, with their own passphrase.",
  AFTER_CLOSING_RETENDER: "The roster cannot change now, so the share cannot be transferred. Without every named officer the bids cannot be opened, and the exercise must be re-tendered.",
};

// ------------------------------------------------------------------ a substitution in two steps (wave 3b step 17)

/**
 * After publication a substitution is two acts. First an authority names the incoming officer in the departing officer's place (a controlled change, with the authority and the reason:
 * the departing row ends and the incoming row begins, and the key is NOT changed, since a bid may already be sealed to it). The incoming officer then sets their own share, and the departing
 * officer releases theirs. Until that last act the key is split across the departed officer, not the named one, so the opening cannot start (`KEY_OFFICERS_MISMATCH`), and this says so.
 */

/// An officer taken off by a substitution who still holds a live share of the live key: the share is theirs to release.
export interface DepartedHolder { rosterRowId: string; officerKeyId: string; personId: string; name: string }
/// A named officer on the live roster with no live share of the live key.
export interface ShareLessOfficer { rosterRowId: string; personId: string; name: string; hasKey: boolean }

export type PendingSubstitution =
  | { state: "NONE" }
  | { state: "PENDING"; departing: DepartedHolder; incoming: ShareLessOfficer }
  | { state: "AMBIGUOUS" };

/**
 * Which substitution is waiting. One departed holder and one named officer without a share are one substitution. More of either is ambiguous, and nothing is paired by guesswork (the schema has no
 * link between the two rows): the start of a second substitution is refused while one is waiting, so ambiguous is a state the product does not make, and is read as a refusal if it is ever found.
 */
export function pendingSubstitution(i: { departed: readonly DepartedHolder[]; shareless: readonly ShareLessOfficer[] }): PendingSubstitution {
  if (i.departed.length === 0) return { state: "NONE" };
  if (i.departed.length === 1 && i.shareless.length === 1) return { state: "PENDING", departing: i.departed[0], incoming: i.shareless[0] };
  return { state: "AMBIGUOUS" };
}

export type StartSubstitutionFault = "AFTER_CLOSING_RETENDER" | "NOT_PUBLISHED_ONLINE" | "KEY_NOT_LIVE" | "ANOTHER_WAITING" | "DEPARTING_HOLDS_NO_SHARE";

/// Whether an authority may now name an incoming officer in place of a departing one on a published ONLINE exercise. `change` is `rosterChange`'s verdict.
export function startSubstitutionFaults(i: { change: RosterChange; publishedOnline: boolean; keyLive: boolean; pending: PendingSubstitution["state"]; departingHoldsShare: boolean }): StartSubstitutionFault[] {
  if (i.change === "REFUSED") return ["AFTER_CLOSING_RETENDER"];
  if (!i.publishedOnline) return ["NOT_PUBLISHED_ONLINE"];
  const out: StartSubstitutionFault[] = [];
  if (!i.keyLive) out.push("KEY_NOT_LIVE");
  if (i.pending !== "NONE") out.push("ANOTHER_WAITING");
  if (i.keyLive && !i.departingHoldsShare) out.push("DEPARTING_HOLDS_NO_SHARE");
  return out;
}

export const START_SUBSTITUTION_WORDS: Readonly<Record<StartSubstitutionFault, string>> = {
  AFTER_CLOSING_RETENDER: SUBSTITUTION_WORDS.AFTER_CLOSING_RETENDER,
  NOT_PUBLISHED_ONLINE: "Only an officer of an exercise that is published and takes bids online is replaced this way.",
  KEY_NOT_LIVE: "This exercise has no live key, so there is no share to move. Make the key first.",
  ANOTHER_WAITING: "Another substitution is still waiting for its share to be released. Finish it first: the departing officer releases their share to the incoming officer.",
  DEPARTING_HOLDS_NO_SHARE: "The officer to replace holds no share of the live key, so there is nothing to hand over. The key must be made again before any bid is submitted, and after one the exercise is re-tendered.",
};

/// What the exercise reads while a substitution waits, for the officers and for the opening's gate.
export function pendingSubstitutionWords(p: Extract<PendingSubstitution, { state: "PENDING" }>): string {
  const step = p.incoming.hasKey
    ? `${p.departing.name} has now to release their share to ${p.incoming.name}, with their own passphrase.`
    : `${p.incoming.name} has first to set their own share, and then ${p.departing.name} releases theirs.`;
  return `${p.incoming.name} was named in place of ${p.departing.name}, but the key is still held by ${p.departing.name}. ${step} The opening cannot start until this is done.`;
}

export const AMBIGUOUS_SUBSTITUTION_WORDS = "More than one share is waiting to move and they cannot be told apart. The roster is not changed further here: the exercise must be re-tendered.";
