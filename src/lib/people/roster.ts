/**
 * Who holds which office, as of a date.
 *
 * Pure. This is the join the approval engine cannot make for itself: `resolve.ts`
 * returns a chain of office codes, and only this turns those codes into people who
 * can be asked to sign.
 */

import { inForceOn, periodsOverlap } from "@/lib/effective";

import type { Assignment, Holding, Office, Person, RosterFault } from "./types";

export interface Roster {
  people: readonly Person[];
  offices: readonly Office[];
  assignments: readonly Assignment[];
}

export function assignmentsInForce(roster: Roster, on: Date): Assignment[] {
  return roster.assignments.filter((a) => inForceOn(a, on));
}

/// Every assignment in force, with its person and office resolved.
export function holdingsOn(roster: Roster, on: Date): Holding[] {
  const byPerson = new Map(roster.people.map((p) => [p.id, p]));
  const byCode = new Map(roster.offices.map((o) => [o.code, o]));

  return assignmentsInForce(roster, on)
    .map((assignment) => {
      const person = byPerson.get(assignment.personId);
      if (!person) return null;
      return { assignment, person, office: byCode.get(assignment.roleCode) ?? null };
    })
    .filter((h): h is Holding => h !== null);
}

/**
 * Who holds an office on a date.
 *
 * More than one answer is possible and is not automatically wrong — an office held
 * per department has a holder per department. Two holders at the same scope is a
 * fault, and `rosterFaults` reports it rather than this function picking one.
 */
export function holdersOf(roster: Roster, roleCode: string, on: Date): Person[] {
  return holdingsOn(roster, on)
    .filter((h) => h.assignment.roleCode === roleCode)
    .map((h) => h.person);
}

/// The offices one person holds on a date.
export function officesHeldBy(roster: Roster, personId: string, on: Date): Office[] {
  return holdingsOn(roster, on)
    .filter((h) => h.assignment.personId === personId)
    .map((h) => h.office)
    .filter((o): o is Office => o !== null);
}

/// Offices nobody holds on the date asked about.
export function vacantOffices(roster: Roster, on: Date): Office[] {
  const held = new Set(assignmentsInForce(roster, on).map((a) => a.roleCode));
  return roster.offices.filter((o) => !held.has(o.code));
}

/**
 * What is wrong with the roster on a date.
 *
 * A vacancy matters more where an approval rule actually routes to the office, so
 * `routedToCodes` is taken from the matrix rather than guessed at. Nothing here is
 * repaired: an office with two holders at one scope is a question for the customer.
 */
export function rosterFaults(
  roster: Roster,
  on: Date,
  routedToCodes: readonly string[] = [],
): RosterFault[] {
  const faults: RosterFault[] = [];
  const routed = new Set(routedToCodes);
  const byCode = new Map(roster.offices.map((o) => [o.code, o]));

  for (const office of vacantOffices(roster, on)) {
    faults.push({ kind: "VACANT", roleCode: office.code, routedTo: routed.has(office.code) });
  }

  const inForce = holdingsOn(roster, on);

  for (const holding of inForce) {
    if (!byCode.has(holding.assignment.roleCode)) {
      faults.push({
        kind: "UNKNOWN_OFFICE",
        roleCode: holding.assignment.roleCode,
        personName: holding.person.name,
      });
    }
    if (!holding.person.isActive) {
      faults.push({
        kind: "INACTIVE_HOLDER",
        roleCode: holding.assignment.roleCode,
        personName: holding.person.name,
      });
    }
  }

  // Two people holding one office at one scope over the same days. Compared pairwise;
  // an organisation has offices in the dozens, not the millions.
  for (let i = 0; i < inForce.length; i++) {
    for (let j = i + 1; j < inForce.length; j++) {
      const a = inForce[i];
      const b = inForce[j];
      if (a.assignment.roleCode !== b.assignment.roleCode) continue;
      if ((a.assignment.scope ?? null) !== (b.assignment.scope ?? null)) continue;
      if (a.person.id === b.person.id) continue;
      if (!periodsOverlap(a.assignment, b.assignment)) continue;
      faults.push({
        kind: "OVERLAP",
        roleCode: a.assignment.roleCode,
        scope: a.assignment.scope ?? null,
        personNames: [a.person.name, b.person.name],
      });
    }
  }

  return faults;
}

/**
 * Can this office be asked to sign today?
 *
 * Three states, not two. An office nobody holds is not the same as one held by
 * somebody unavailable, and neither is the same as one that is ready — the same
 * distinction quorum draws between not met and not set.
 */
export type OfficeReadiness = "READY" | "VACANT" | "CONTESTED";

export function officeReadiness(roster: Roster, roleCode: string, on: Date): OfficeReadiness {
  const holders = holdersOf(roster, roleCode, on).filter((p) => p.isActive);
  if (holders.length === 0) return "VACANT";

  const scopes = new Set(
    assignmentsInForce(roster, on)
      .filter((a) => a.roleCode === roleCode)
      .map((a) => a.scope ?? ""),
  );
  // One holder per scope is normal; two at the same scope is not.
  return holders.length > scopes.size ? "CONTESTED" : "READY";
}
