/**
 * The officers named on a sourcing exercise to open its bids (Sourcing Requirements v2, SR-07, ruling 11). Pure.
 *
 * The number required is the opening committee's `panelSize` (FR-OPN-002): configuration, never a literal here. An unset size
 * refuses, saying so ("the number of opening officers is not set"); it is not a size of zero. Each officer must hold a seat on
 * the method's opening committee in force, be distinct from the others, be active, and be outside the independence rule's excluded
 * unit where that rule is on (FR-CTE-011). A person who holds an administrator account is refused: administration is kept apart from
 * transactions (NFR-SEC-004, decisions log 2026-10-07), and an opening officer authorises and signs.
 *
 * The seat, panel-size and independence checks are the opening panel's own (`panelFaults`), asked again rather than restated: they are
 * judged when an officer is named, at submission, and again when the opening starts. What the panel judges at the table and the roster
 * does not is presence (nobody is present until they sit) and the override of another size (the roster is exact).
 */

import { panelFaults, type PanelFault, type PanelPolicy, type PanelPick, type SeatHolder } from "./panel";
import type { Finding } from "./types";

export type RosterFault =
  | "COMMITTEE_NOT_SET"
  | "COMMITTEE_NOT_FOUND"
  | "PANEL_SIZE_NOT_SET"
  | "OFFICERS_SHORT"
  | "OFFICERS_TOO_MANY"
  | "PICKED_TWICE"
  | "NOT_ON_COMMITTEE"
  | "PERSON_INACTIVE"
  | "OFFICER_IS_ADMINISTRATOR"
  | "EXCLUSION_RULE_NOT_SET"
  | "EXCLUDED_UNIT_NOT_SET"
  | "MEMBER_IN_EXCLUDED_UNIT"
  | "UNIT_NOT_RECORDED";

/// The panel's findings the roster keeps; the rest (presence, an override of another size) belong to the table, not the list.
const KEPT: ReadonlySet<PanelFault> = new Set<PanelFault>(["COMMITTEE_NOT_SET", "COMMITTEE_NOT_FOUND", "PICKED_TWICE", "NOT_ON_COMMITTEE", "PERSON_INACTIVE", "EXCLUSION_RULE_NOT_SET", "EXCLUDED_UNIT_NOT_SET", "MEMBER_IN_EXCLUDED_UNIT", "UNIT_NOT_RECORDED"]);

export interface RosterOfficer {
  personId: string;
  name: string;
  active: boolean;
  /// The person's unit as recorded on them; null: not recorded.
  orgUnitCode: string | null;
  /// Whether the person holds a sign-in account that administers (NFR-SEC-004).
  administrator: boolean;
}

export interface RosterInput {
  /// The method's opening committee code; null: the method names none.
  committeeCode: string | null;
  committee: { name: string } | null;
  seats: readonly SeatHolder[];
  officers: readonly RosterOfficer[];
  policy: PanelPolicy;
  unitPath: (code: string) => readonly string[];
}

/**
 * Everything wrong with a roster as a whole: the count against the committee's size, then each officer. A roster that is only short is the
 * state of a list still being made, so a caller that is adding one filters `OFFICERS_SHORT` out (`addOfficerFaults`).
 */
export function rosterFaults(i: RosterInput): Finding<RosterFault>[] {
  const out: Finding<RosterFault>[] = [];
  if (!i.committeeCode) return [{ code: "COMMITTEE_NOT_SET", level: "block" }];
  if (!i.committee) return [{ code: "COMMITTEE_NOT_FOUND", level: "block" }];
  const size = i.policy.panelSize;
  if (size == null) out.push({ code: "PANEL_SIZE_NOT_SET", level: "block" });
  const named = new Set(i.officers.map((o) => o.personId)).size;
  if (size != null && named < size) out.push({ code: "OFFICERS_SHORT", level: "block", data: { required: size, named } });
  if (size != null && named > size) out.push({ code: "OFFICERS_TOO_MANY", level: "block", data: { required: size, named } });
  if (i.officers.length > 0) {
    const picked: PanelPick[] = i.officers.map((o) => ({ personId: o.personId, name: o.name, present: true, active: o.active, orgUnitCode: o.orgUnitCode }));
    for (const f of panelFaults({ committeeCode: i.committeeCode, committee: i.committee, seats: i.seats, picked, policy: i.policy, override: null, unitPath: i.unitPath })) {
      if (KEPT.has(f.code)) out.push(f as Finding<RosterFault>);
    }
  }
  for (const o of i.officers) if (o.administrator) out.push({ code: "OFFICER_IS_ADMINISTRATOR", level: "block", data: { person: o.name } });
  return out;
}

/// The findings that belong to the roster as a whole, not to one person on it.
const LISTWIDE: ReadonlySet<RosterFault> = new Set<RosterFault>(["COMMITTEE_NOT_SET", "COMMITTEE_NOT_FOUND", "PANEL_SIZE_NOT_SET", "OFFICERS_SHORT", "OFFICERS_TOO_MANY"]);

/// Whether a finding is about the list (the committee, the number) rather than about the person being named.
export const isListFault = (code: string) => LISTWIDE.has(code as RosterFault);

/**
 * Naming one more officer, or the one who replaces another: only what is wrong with the incoming person, the committee and the number,
 * and the person being named twice. An officer who stays is not judged again here (their faults belong to the submit and opening gates),
 * so replacing one officer is never blocked by the state of another, and several replacements can follow one another. The list still
 * being short is not a fault of naming.
 */
export function addOfficerFaults(i: RosterInput, added: RosterOfficer): Finding<RosterFault>[] {
  const whole = rosterFaults({ ...i, officers: [...i.officers, added] });
  const alone = rosterFaults({ ...i, officers: [added] });
  const listLevel = whole.filter((f) => (LISTWIDE.has(f.code) && f.code !== "OFFICERS_SHORT") || f.code === "PICKED_TWICE");
  const aboutThem = alone.filter((f) => !LISTWIDE.has(f.code));
  return [...listLevel, ...aboutThem];
}

// ------------------------------------------------------------------ changing the roster

export type RosterChange = "FREE" | "CONTROLLED" | "REFUSED";
export type RosterChangeFault = "EXERCISE_CANCELLED" | "AFTER_CLOSING" | "OPENING_STARTED" | "AUTHORITY_REQUIRED" | "REASON_REQUIRED";

/**
 * How the roster may change now (ruling 11). Before the documents are submitted it is an ordinary edit. From submission to the closing it
 * changes only by a controlled change, with the authority it is made under and a reason recorded. At the closing, and after it, it does not
 * change at all: no substitution, and no single-person recovery; the exercise cannot be opened without every named officer, and the screen says
 * it must be re-tendered. (For an online exercise the key is rewrapped at substitution; that waits for SR-13, ruling 20 and 21.)
 */
export function rosterChange(i: { status: string; closing: Date | null; now: Date; openingStarted: boolean }): { change: RosterChange; fault: RosterChangeFault | null } {
  if (i.status === "CANCELLED") return { change: "REFUSED", fault: "EXERCISE_CANCELLED" };
  if (i.status === "DRAFT" || i.status === "DOCUMENTS_IN_PREPARATION") return { change: "FREE", fault: null };
  if (i.openingStarted) return { change: "REFUSED", fault: "OPENING_STARTED" };
  if (i.closing && i.closing.getTime() <= i.now.getTime()) return { change: "REFUSED", fault: "AFTER_CLOSING" };
  return { change: "CONTROLLED", fault: null };
}

/// A controlled change names its authority and its reason.
export function controlledChangeFaults(i: { authority: string; reason: string }): Finding<RosterChangeFault>[] {
  const out: Finding<RosterChangeFault>[] = [];
  if (!i.authority.trim()) out.push({ code: "AUTHORITY_REQUIRED", level: "block" });
  if (!i.reason.trim()) out.push({ code: "REASON_REQUIRED", level: "block" });
  return out;
}
