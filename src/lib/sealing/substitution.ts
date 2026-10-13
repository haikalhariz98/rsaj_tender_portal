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
