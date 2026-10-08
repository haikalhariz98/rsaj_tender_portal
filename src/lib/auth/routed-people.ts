import { decidingDelegates } from "@/lib/authority/absence";
import { seatsInForce } from "@/lib/committee/seats";
import type { Effective } from "@/lib/effective";
import type { Holders } from "@/lib/requisition/holders";

import type { Words } from "./words";

/**
 * Who a route names (product owner, 2026-10-08, rulings on log lines 1711 and the amendment of 1526; ADR 0034 D14: "on the routed step's holders, or holds a committee seat for the
 * tabled matter"). Pure: the facts of the routes, the offices and the committee seats are read by `routed-people-store.ts` and handed in. Nothing here is a list anyone keeps:
 * every name is WORKED OUT WHEN READ, from the routes, the sittings and the roster, so it is never out of step with them.
 *
 * - Whoever is able to decide a pending step of a route is named while that step is pending: a holder of the office acting for the step, or a delegate the decision rule would
 *   not refuse (`decidingDelegates`: a step only the holder may decide has no delegate, and a delegation capped below the route's value cannot decide it). The step that is
 *   pending is the NEXT one of the route: steps are decided in order (`deciderFaults` refuses an earlier one still pending), so a later holder cannot decide yet. A committee's
 *   step is decided at its sitting, not by a person, and names nobody here (the committee's roster is named by the sitting, below).
 * - Whoever decided a step stays named, whatever became of the route.
 * - The members of the committee a matter is tabled to are named from the tabling, on the roster in force on the sitting's date, and stay named.
 */

/// A step of a route, as far as naming goes.
export interface NamingStep {
  sequence: number;
  decision: string;
  roleCode: string | null;
  actingRoleCode: string | null;
  committeeCode: string | null;
  nonDelegable: boolean;
  decidedByPersonId: string | null;
}

export interface NamingRoute {
  status: string;
  /// What a delegate's ceiling is judged against, in sen (`ceilingValue`).
  value: bigint;
  steps: readonly NamingStep[];
}

export interface RoutePeople {
  /// Able to decide the step that is pending now.
  holderIds: string[];
  /// Decided a step of the route.
  deciderIds: string[];
}

/// The step a route is waiting on: its first undecided one, in order.
export function pendingStep<T extends { sequence: number; decision: string }>(steps: readonly T[]): T | null {
  return [...steps].sort((a, b) => a.sequence - b.sequence).find((s) => s.decision === "PENDING") ?? null;
}

/**
 * The people a route names. `holdersOf` gives the holders of an office for the matter's unit on the day, or null where they cannot be told (no day, no unit): nobody is then
 * named on that account, and the gap is the screen's to say, not a guess here. `isActive` leaves out a person recorded as having left (`deciderFaults` refuses them).
 */
export function routePeople(route: NamingRoute, holdersOf: (officeCode: string) => Holders | null, isActive: (personId: string) => boolean): RoutePeople {
  const deciderIds = [...new Set(route.steps.flatMap((s) => (s.decidedByPersonId ? [s.decidedByPersonId] : [])))];
  const next = route.status === "PENDING" ? pendingStep(route.steps) : null;
  if (!next || next.committeeCode) return { holderIds: [], deciderIds };
  const office = next.actingRoleCode ?? next.roleCode;
  const h = office ? holdersOf(office) : null;
  if (!h) return { holderIds: [], deciderIds };
  const able = [...h.holderIds, ...decidingDelegates(h.delegates, next, route.value).map((d) => d.personId)].filter(isActive);
  return { holderIds: [...new Set(able)], deciderIds };
}

/// A committee seat, as far as naming goes.
export interface NamingSeat extends Effective {
  personId: string | null;
  seatRoleCode: string | null;
}

/**
 * Everyone on a committee's roster on a date: the seats in force, whoever holds them. A seat held by named appointment names that person; a seat held ex officio names whoever
 * holds the office that day (`holdersOfOffice`, active holders only), every one of them, since the roster does not pick a holder for a contested office. The Secretary and the
 * alternates are on the roster, so they are named too.
 */
export function committeeRosterIds(seats: readonly NamingSeat[], on: Date, holdersOfOffice: (officeCode: string) => readonly string[]): string[] {
  return [...new Set(seatsInForce(seats, on).flatMap((s) => (s.seatRoleCode ? holdersOfOffice(s.seatRoleCode) : s.personId ? [s.personId] : [])))];
}

// ------------------------------------------------------------------ words

/// How the routed names read, for the basis words and the Access tab's headings (the product owner's words).
export const ROUTED_NAMED_WORDS = {
  STEP_HOLDER: { en: "holds a step on its route", ms: "memegang langkah pada laluannya" },
  STEP_DECIDER: { en: "decided a step on its route", ms: "memutuskan langkah pada laluannya" },
  COMMITTEE_MEMBER: { en: "member of the committee it is tabled to", ms: "ahli jawatankuasa yang dikemukakan kepadanya" },
} as const satisfies Record<string, Words>;

/// The Access tab's headings: the product owner's words, capitalised.
export const ROUTED_NAMED_HEADINGS = {
  STEP_HOLDER: "Holds a step on its route",
  STEP_DECIDER: "Decided a step on its route",
  COMMITTEE_MEMBER: "Member of the committee it is tabled to",
} as const;

/// What the Access tab says under each heading about when a person stops being named, so nobody takes a derived name for a list somebody keeps.
export const ROUTED_NAMED_ABOUT = {
  STEP_HOLDER: { en: "Named while the step is pending: whoever holds the office acting for it, or a delegate who would not be refused. Nobody keeps this list; it is worked out each time from the routes.", ms: "Dinamakan selagi langkah itu belum diputuskan." },
  STEP_DECIDER: { en: "Named for good once they have decided a step.", ms: "Dinamakan selama-lamanya selepas memutuskan langkah." },
  COMMITTEE_MEMBER: { en: "Named from the day a matter of this exercise is tabled to the committee, on the roster in force on the sitting's date, and for good after.", ms: "Dinamakan dari hari perkara dikemukakan kepada jawatankuasa." },
} as const satisfies Record<string, Words>;
