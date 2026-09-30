/**
 * Who sits at a sitting, and in which seat.
 *
 * Pure. A seat is held ex officio (by whoever holds an office on the day) or by named
 * appointment; an alternate covers a seat only when its holder is absent. Everything
 * here is judged on the sitting date, never today's, so a past sitting keeps the
 * membership it was actually held by.
 *
 * Two product assumptions live here and are shown on screen:
 *  - the Secretary never votes and never counts toward quorum (ruling 5.8);
 *  - nobody stands in for the chair (FR-CTE-012, OQ-01).
 */

import type { Effective } from "@/lib/effective";
import { holdersOf, type Roster } from "@/lib/people/roster";

import { seatsInForce } from "./seats";

export type CommitteePosition = "CHAIRMAN" | "DEPUTY_CHAIRMAN" | "MEMBER" | "SECRETARY";

/// A committee seat as stored.
export interface Seat extends Effective {
  id: string;
  position: CommitteePosition;
  personId: string | null;
  seatRoleCode: string | null;
  seatLabel: string | null;
  isAlternate: boolean;
  alternateForId: string | null;
}

/// A seat resolved to the person who holds it on the sitting date.
export interface VotingSeat {
  seatId: string;
  position: CommitteePosition;
  /// Null when the office is vacant, or when it has more than one holder and the
  /// system will not pick one.
  personId: string | null;
  name: string | null;
  via: "NAMED" | "EX_OFFICIO";
  /// The office's name where the seat is ex officio, or the seat's own description.
  officeLabel: string | null;
  vacant: boolean;
  /// More than one active holder of the office on the date. Reported, never resolved.
  contested: boolean;
}

export interface AlternateSeat extends VotingSeat {
  /// The seat this alternate may cover. Null covers any seat of its position.
  forSeatId: string | null;
}

function resolve(seat: Seat, roster: Roster, on: Date): VotingSeat {
  const people = new Map(roster.people.map((p) => [p.id, p]));
  if (seat.seatRoleCode) {
    const holders = holdersOf(roster, seat.seatRoleCode, on).filter((p) => p.isActive);
    const unique = [...new Map(holders.map((h) => [h.id, h])).values()];
    const office = roster.offices.find((o) => o.code === seat.seatRoleCode);
    const one = unique.length === 1 ? unique[0] : null;
    return {
      seatId: seat.id,
      position: seat.position,
      personId: one?.id ?? null,
      name: one?.name ?? null,
      via: "EX_OFFICIO",
      officeLabel: office?.nameEn ?? seat.seatLabel ?? null,
      vacant: unique.length === 0,
      contested: unique.length > 1,
    };
  }
  const person = seat.personId ? people.get(seat.personId) : undefined;
  return {
    seatId: seat.id,
    position: seat.position,
    personId: seat.personId,
    name: person?.name ?? null,
    via: "NAMED",
    officeLabel: seat.seatLabel,
    vacant: seat.personId == null,
    contested: false,
  };
}

/// The seats that vote on the date: in force, not the Secretary, not an alternate.
export function votingSeatsOn(seats: readonly Seat[], roster: Roster, on: Date): VotingSeat[] {
  return seatsInForce(seats, on)
    .filter((s) => !s.isAlternate && s.position !== "SECRETARY")
    .map((s) => resolve(s, roster, on));
}

/// Alternates in force on the date, each with the seat it may cover.
export function alternatesOn(seats: readonly Seat[], roster: Roster, on: Date): AlternateSeat[] {
  return seatsInForce(seats, on)
    .filter((s) => s.isAlternate)
    .map((s) => ({ ...resolve(s, roster, on), forSeatId: s.alternateForId }));
}

/// People who may attend but never vote or count: the Secretary's seat holders.
export function nonVotingMembersOn(seats: readonly Seat[], roster: Roster, on: Date): string[] {
  return seatsInForce(seats, on)
    .filter((s) => !s.isAlternate && s.position === "SECRETARY")
    .map((s) => resolve(s, roster, on).personId)
    .filter((id): id is string => id != null);
}

export type AttendanceFault =
  | "NOT_A_MEMBER"
  | "STAND_IN_FOR_CHAIR"
  | "STAND_IN_WHILE_HOLDER_PRESENT"
  | "ALTERNATE_NOT_FOR_THAT_SEAT"
  | "SEAT_COVERED_TWICE";

export interface AttendanceRecord {
  personId: string;
  attended: boolean;
  standingInForSeatId: string | null;
}

export interface Occupant {
  seatId: string;
  personId: string;
  /// True where an alternate covers the seat for an absent holder.
  standIn: boolean;
}

export interface PresentVoters {
  /// Each person counted once, however many seats they fill.
  voterIds: string[];
  /// Who sits in which voting seat at this sitting.
  occupants: Occupant[];
  faults: { personId: string; fault: AttendanceFault }[];
}

/**
 * Who is present and entitled to vote.
 *
 * An attendee who is neither a voting member, an alternate nor a non-voting member is
 * a fault rather than an observer: the register is of the body, and nothing in the
 * source provides for others to be minuted as present.
 */
export function presentVoters(i: {
  voting: readonly VotingSeat[];
  alternates: readonly AlternateSeat[];
  nonVotingMemberIds: readonly string[];
  attendance: readonly AttendanceRecord[];
}): PresentVoters {
  const present = i.attendance.filter((a) => a.attended);
  const holdersPresent = new Set(
    present.filter((a) => a.standingInForSeatId == null).map((a) => a.personId),
  );

  const occupants: Occupant[] = [];
  const faults: PresentVoters["faults"] = [];
  const covered = new Set<string>();

  // Holders first, so a stand-in can be checked against a holder who is present.
  for (const a of present.filter((r) => r.standingInForSeatId == null)) {
    const held = i.voting.filter((s) => s.personId === a.personId);
    if (held.length > 0) {
      for (const s of held) {
        occupants.push({ seatId: s.seatId, personId: a.personId, standIn: false });
        covered.add(s.seatId);
      }
      continue;
    }
    if (i.nonVotingMemberIds.includes(a.personId)) continue;
    // An alternate may attend without covering anyone. They are not counted.
    if (i.alternates.some((s) => s.personId === a.personId)) continue;
    faults.push({ personId: a.personId, fault: "NOT_A_MEMBER" });
  }

  for (const a of present.filter((r) => r.standingInForSeatId != null)) {
    const seat = i.voting.find((s) => s.seatId === a.standingInForSeatId);
    if (!seat) {
      faults.push({ personId: a.personId, fault: "ALTERNATE_NOT_FOR_THAT_SEAT" });
      continue;
    }
    if (seat.position === "CHAIRMAN") {
      faults.push({ personId: a.personId, fault: "STAND_IN_FOR_CHAIR" });
      continue;
    }
    const mayCover = i.alternates.some(
      (alt) =>
        alt.personId === a.personId &&
        (alt.forSeatId === seat.seatId || (alt.forSeatId == null && alt.position === seat.position)),
    );
    if (!mayCover) {
      faults.push({ personId: a.personId, fault: "ALTERNATE_NOT_FOR_THAT_SEAT" });
      continue;
    }
    if (seat.personId != null && holdersPresent.has(seat.personId)) {
      faults.push({ personId: a.personId, fault: "STAND_IN_WHILE_HOLDER_PRESENT" });
      continue;
    }
    if (covered.has(seat.seatId)) {
      faults.push({ personId: a.personId, fault: "SEAT_COVERED_TWICE" });
      continue;
    }
    occupants.push({ seatId: seat.seatId, personId: a.personId, standIn: true });
    covered.add(seat.seatId);
  }

  return { voterIds: [...new Set(occupants.map((o) => o.personId))], occupants, faults };
}
