/**
 * Reads what the opening officers' roster is judged with (SR-07, ruling 11), for a screen or inside an action that holds the exercise's lock.
 * Reads only. The rules are `roster.ts`; this file only loads the facts they read, as `openingContext` does for the opening itself, so the
 * seats and the independence rule are the opening's own and are asked again at each step: when an officer is named, when the documents are
 * submitted, and when the opening starts.
 */

import type { Tx } from "@/lib/audit/record";
import { dayToDate } from "@/lib/dates";
import { db } from "@/lib/db";
import { wholePathTo } from "@/lib/organisation/structure";
import type { OrgUnit } from "@/lib/organisation/types";
import { loadRoster } from "@/lib/people/load";

import type { Finding } from "./types";
import { seatHolders } from "./repo";
import { rosterFaults, type RosterFault, type RosterInput, type RosterOfficer } from "./roster";

export interface RosterRow {
  id: string;
  personId: string;
  name: string;
  active: boolean;
  seatLabel: string;
  committeeMemberId: string | null;
  namedAt: Date;
  namedBy: string;
}

export interface RosterContext {
  /// Whether this exercise was pinned to name its officers on it (G1); false: its panel is still picked when the opening starts.
  required: boolean;
  /// The officers now on it, oldest first.
  rows: RosterRow[];
  /// The officers who have since been replaced or taken off, newest first, for the history under the card.
  ended: { personId: string; name: string; seatLabel: string; endedAt: Date; endedBy: string; authority: string; reason: string }[];
  /// What `rosterFaults` reads.
  input: RosterInput;
  committee: { code: string; nameEn: string; panelSize: number | null } | null;
  /// The people who may be named: holders of a seat of the committee on the day, active, with their seat, and not already named.
  candidates: { personId: string; name: string; seatLabel: string }[];
}

/**
 * The roster of one exercise, with the committee the method names, its seats on the organisation's day, and the people who hold them.
 * `today` null (no time zone): nothing is read "on" a UTC day, so no seat is held and the roster says what is missing.
 */
export async function loadOpeningRoster(
  ex: { id: string; sourcingMethodCode: string; openingRosterRequired: boolean },
  org: { id: string; code: string; today: string | null },
  client: Tx = db,
): Promise<RosterContext> {
  const method = await client.sourcingMethod.findFirst({ where: { organisationId: org.id, code: ex.sourcingMethodCode }, select: { openingCommitteeCode: true } });
  const committee = method?.openingCommitteeCode ? await client.committee.findFirst({ where: { organisationId: org.id, code: method.openingCommitteeCode, retiredOn: null }, include: { members: true } }) : null;
  const all = await client.exerciseOpeningOfficer.findMany({
    where: { exerciseId: ex.id },
    orderBy: [{ namedAt: "asc" }, { id: "asc" }],
    include: { person: { select: { id: true, name: true, isActive: true, orgUnitCode: true } }, namedBy: { select: { name: true } }, endedBy: { select: { name: true } } },
  });
  const live = all.filter((r) => r.endedAt == null);
  const administrators = new Set((await client.staffAccount.findMany({ where: { organisationId: org.id, isAdministrator: true, personId: { in: live.map((r) => r.personId) } }, select: { personId: true } })).map((a) => a.personId));
  const units = (await client.orgUnit.findMany({ where: { organisationId: org.id } })) as unknown as OrgUnit[];
  const people = await loadRoster(org.code, client);
  const on = org.today ? dayToDate(org.today) : null;
  const seats = committee && on ? seatHolders(committee.members, people, on) : [];
  const officers: RosterOfficer[] = live.map((r) => ({ personId: r.personId, name: r.person.name, active: r.person.isActive, orgUnitCode: r.person.orgUnitCode, administrator: administrators.has(r.personId) }));
  const input: RosterInput = {
    committeeCode: method?.openingCommitteeCode ?? null,
    committee: committee ? { name: committee.nameEn } : null,
    seats,
    officers,
    policy: { panelSize: committee?.panelSize ?? null, exclusionRule: committee?.panelExclusionRule ?? null, excludedUnitCode: committee?.panelExcludesUnitCode ?? null },
    unitPath: (code: string) => (on ? wholePathTo(units, code, on).map((u) => u.code) : []),
  };
  const named = new Set(live.map((r) => r.personId));
  const holders = seats.filter((s) => !named.has(s.personId));
  const holderPeople = holders.length ? await client.person.findMany({ where: { organisationId: org.id, id: { in: holders.map((h) => h.personId) }, isActive: true }, select: { id: true, name: true } }) : [];
  return {
    required: ex.openingRosterRequired,
    rows: live.map((r) => ({ id: r.id, personId: r.personId, name: r.person.name, active: r.person.isActive, seatLabel: r.seatLabelSnapshot, committeeMemberId: r.committeeMemberId, namedAt: r.namedAt, namedBy: r.namedBy.name })),
    ended: all
      .filter((r) => r.endedAt != null)
      .reverse()
      .map((r) => ({ personId: r.personId, name: r.person.name, seatLabel: r.seatLabelSnapshot, endedAt: r.endedAt!, endedBy: r.endedBy?.name ?? "", authority: r.endedAuthority, reason: r.endedReason })),
    input,
    committee: committee ? { code: committee.code, nameEn: committee.nameEn, panelSize: committee.panelSize } : null,
    candidates: holderPeople.map((p) => ({ personId: p.id, name: p.name, seatLabel: seats.find((s) => s.personId === p.id)?.seatLabel ?? "Member" })).sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/// The roster's findings as the submit gate and the opening's start read them: none where the exercise was not pinned to name its officers.
export function rosterFindings(r: RosterContext): Finding<RosterFault>[] {
  return r.required ? rosterFaults(r.input) : [];
}
