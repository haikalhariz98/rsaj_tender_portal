/**
 * The roster's findings in words (SR-07, ruling 11). Most are the opening panel's own sentences (`openingFindingText`), where the words
 * for the roster's codes sit beside them. Only the three that read differently when officers are being named, rather than a panel being
 * seated on the day, are worded here.
 */

import { openingFindingText, SETTING_AT } from "./labels";
import type { RosterChangeFault } from "./roster";
import type { Finding } from "./types";

const d = (f: Finding, k: string) => String(f.data?.[k] ?? "");

const OWN: Readonly<Record<string, (f: Finding) => string>> = {
  PANEL_SIZE_NOT_SET: () => `The number of opening officers is not set. Set the opening committee's panel size under ${SETTING_AT.committee}.`,
  PICKED_TWICE: (f) => `${d(f, "person")} is named twice. Each opening officer is a different person.`,
  NOT_ON_COMMITTEE: (f) => `${d(f, "person")} does not hold a seat on the opening committee in force today. Only a member of that committee opens bids.`,
};

/// A roster finding in words.
export function rosterFindingText(f: Finding): string {
  return OWN[f.code]?.(f) ?? openingFindingText(f);
}

/// Why the roster cannot change now, or what a controlled change still lacks.
export const rosterChangeText = (c: RosterChangeFault) => openingFindingText({ code: c, level: "block" });

/// Said on the card whenever an officer can be replaced before the closing, so nobody is surprised by the day it closes.
export const ROSTER_AFTER_CLOSING_NOTE = "After the closing there is no replacing an officer: the bids cannot be opened without every named officer, and the exercise would have to be re-tendered.";

type Allowed = { allowed: true } | { allowed: false; reason: string };

/**
 * What the Opening officers card may offer now, each act with its reason where it is withheld (the screen disables with the reason, and
 * the action asks the same rules again). `nameRefusal` is the exercise's naming rule: being named opens its classified figures.
 */
export function rosterActs(i: {
  change: { change: "FREE" | "CONTROLLED" | "REFUSED"; fault: RosterChangeFault | null };
  committeeReady: boolean;
  size: number | null;
  named: number;
  candidates: number;
  nameRefusal: string | null;
}): { name: Allowed; remove: Allowed; substitute: Allowed & { controlled?: boolean } } {
  const ok: Allowed = { allowed: true };
  const no = (reason: string): Allowed => ({ allowed: false, reason });
  if (i.change.fault) {
    const r = rosterChangeText(i.change.fault);
    return { name: no(r), remove: no(r), substitute: no(r) };
  }
  const controlled = i.change.change === "CONTROLLED";
  const afterSubmission = "The documents are submitted, so an officer is replaced by a controlled change, not added or taken off.";
  const substitute: Allowed & { controlled?: boolean } = i.nameRefusal ? no(i.nameRefusal) : i.candidates === 0 ? no("Nobody else holds a seat on the opening committee today.") : { ...ok, controlled };
  const remove = controlled ? no(afterSubmission) : ok;
  if (controlled) return { name: no(afterSubmission), remove, substitute };
  if (!i.committeeReady) return { name: no("The method names no opening committee, or it is not configured. Set it under Configuration, Reference data."), remove, substitute };
  if (i.size == null) return { name: no("The number of opening officers is not set. Set the opening committee's panel size under Configuration, Committees."), remove, substitute };
  if (i.nameRefusal) return { name: no(i.nameRefusal), remove, substitute };
  if (i.named >= i.size) return { name: no(`${i.size === 1 ? "The one opening officer" : `All ${i.size} opening officers`} ${i.size === 1 ? "is" : "are"} named. Replace one, or take one off first.`), remove, substitute };
  if (i.candidates === 0) return { name: no("Nobody else holds a seat on the opening committee today."), remove, substitute };
  return { name: ok, remove, substitute };
}
