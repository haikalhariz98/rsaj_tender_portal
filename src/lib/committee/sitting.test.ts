import { describe, expect, it } from "vitest";

import type { Roster } from "@/lib/people/roster";
import type { Office, Person } from "@/lib/people/types";

import { quorumFaults } from "./quorum";
import {
  alternatesOn,
  nonVotingMembersOn,
  presentVoters,
  votingSeatsOn,
  type AttendanceRecord,
  type Seat,
} from "./sitting";

/*
 * A synthetic body, not any customer's: a chair held ex officio by an office that
 * changes hands, a member held ex officio, a named member with a named alternate, a
 * floating alternate for any member seat, and a Secretary.
 */

const person = (id: string, name: string, isActive = true): Person => ({
  id, staffNo: null, name, email: null, jobTitle: null, jobTitleMs: null, department: null,
  telephone: null, portalRoleCode: null, authorityLevel: null, isAvailable: true, isActive,
});
const office = (code: string, nameEn: string): Office => ({
  id: `o-${code}`, code, nameEn, nameMs: nameEn, isCommittee: false, workspace: "", authorityLevel: "",
  escalatesToCode: null, selfApprovalEscalatesToCode: null, sortOrder: 0,
});
const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const roster: Roster = {
  people: [
    person("old-chief", "Former Chief"),
    person("chief", "Current Chief"),
    person("money", "Money Officer"),
    person("named", "Named Member"),
    person("alt", "Named Alternate"),
    person("float", "Floating Alternate"),
    person("sec", "Secretary Person"),
    person("stranger", "Not A Member"),
  ],
  offices: [office("CHIEF", "Chief Office"), office("MONEY", "Money Office"), office("VACANT", "Vacant Office")],
  assignments: [
    { id: "a1", personId: "old-chief", roleCode: "CHIEF", scope: null, effectiveFrom: d("2024-01-01"), effectiveTo: d("2025-01-01") },
    { id: "a2", personId: "chief", roleCode: "CHIEF", scope: null, effectiveFrom: d("2025-01-01"), effectiveTo: null },
    { id: "a3", personId: "money", roleCode: "MONEY", scope: null, effectiveFrom: d("2024-01-01"), effectiveTo: null },
  ],
};

const seat = (s: Partial<Seat> & Pick<Seat, "id" | "position">): Seat => ({
  personId: null, seatRoleCode: null, seatLabel: null, isAlternate: false, alternateForId: null,
  effectiveFrom: d("2024-01-01"), effectiveTo: null, ...s,
});

const SEATS: Seat[] = [
  seat({ id: "s-chair", position: "CHAIRMAN", seatRoleCode: "CHIEF" }),
  seat({ id: "s-money", position: "MEMBER", seatRoleCode: "MONEY" }),
  seat({ id: "s-named", position: "MEMBER", personId: "named" }),
  seat({ id: "s-alt", position: "MEMBER", personId: "alt", isAlternate: true, alternateForId: "s-named" }),
  seat({ id: "s-float", position: "MEMBER", personId: "float", isAlternate: true }),
  seat({ id: "s-sec", position: "SECRETARY", personId: "sec" }),
];

const ON = d("2026-03-01");
const here = (personId: string, standingInForSeatId: string | null = null): AttendanceRecord => ({
  personId, attended: true, standingInForSeatId,
});

function sit(attendance: AttendanceRecord[], on = ON) {
  return presentVoters({
    voting: votingSeatsOn(SEATS, roster, on),
    alternates: alternatesOn(SEATS, roster, on),
    nonVotingMemberIds: nonVotingMembersOn(SEATS, roster, on),
    attendance,
  });
}

describe("votingSeatsOn", () => {
  it("resolves an ex-officio seat to the holder on the sitting date, not today's", () => {
    const past = votingSeatsOn(SEATS, roster, d("2024-06-01")).find((s) => s.seatId === "s-chair");
    const now = votingSeatsOn(SEATS, roster, ON).find((s) => s.seatId === "s-chair");
    expect(past).toMatchObject({ personId: "old-chief", via: "EX_OFFICIO", vacant: false });
    expect(now).toMatchObject({ personId: "chief", name: "Current Chief", officeLabel: "Chief Office" });
  });

  it("gives a vacant office vacant: true and no person", () => {
    const seats = [seat({ id: "s-v", position: "MEMBER", seatRoleCode: "VACANT" })];
    expect(votingSeatsOn(seats, roster, ON)[0]).toMatchObject({ vacant: true, personId: null, contested: false });
  });

  it("does not pick one of two holders of the same office", () => {
    const twice: Roster = {
      ...roster,
      assignments: [
        ...roster.assignments,
        { id: "a9", personId: "named", roleCode: "MONEY", scope: null, effectiveFrom: d("2024-01-01"), effectiveTo: null },
      ],
    };
    const s = votingSeatsOn(SEATS, twice, ON).find((x) => x.seatId === "s-money");
    expect(s).toMatchObject({ contested: true, personId: null, vacant: false });
  });

  it("leaves out the Secretary and alternates", () => {
    const ids = votingSeatsOn(SEATS, roster, ON).map((s) => s.seatId);
    expect(ids).toEqual(["s-chair", "s-money", "s-named"]);
  });

  it("leaves out a seat not in force on the date", () => {
    const ended = [...SEATS.slice(0, 2), seat({ id: "s-gone", position: "MEMBER", personId: "named", effectiveTo: d("2025-01-01") })];
    expect(votingSeatsOn(ended, roster, ON).map((s) => s.seatId)).toEqual(["s-chair", "s-money"]);
  });
});

describe("presentVoters", () => {
  it("counts the Secretary as present without a fault and without a vote", () => {
    const r = sit([here("chief"), here("money"), here("sec")]);
    expect(r.faults).toEqual([]);
    expect(r.voterIds).toEqual(["chief", "money"]);
  });

  it("refuses a stand-in for the chairman (FR-CTE-012)", () => {
    const r = sit([here("float", "s-chair"), here("money")]);
    expect(r.faults).toEqual([{ personId: "float", fault: "STAND_IN_FOR_CHAIR" }]);
    expect(r.voterIds).toEqual(["money"]);
  });

  it("refuses a stand-in while the holder is present", () => {
    const r = sit([here("named"), here("alt", "s-named")]);
    expect(r.faults).toEqual([{ personId: "alt", fault: "STAND_IN_WHILE_HOLDER_PRESENT" }]);
    expect(r.voterIds).toEqual(["named"]);
  });

  it("counts a correct stand-in once, in the seat covered", () => {
    const r = sit([here("chief"), here("alt", "s-named")]);
    expect(r.faults).toEqual([]);
    expect(r.voterIds).toEqual(["chief", "alt"]);
    expect(r.occupants).toContainEqual({ seatId: "s-named", personId: "alt", standIn: true });
  });

  it("refuses an alternate linked to another seat", () => {
    const r = sit([here("alt", "s-money")]);
    expect(r.faults).toEqual([{ personId: "alt", fault: "ALTERNATE_NOT_FOR_THAT_SEAT" }]);
  });

  it("lets a floating alternate cover any seat of its position, but not twice", () => {
    const r = sit([here("alt", "s-named"), here("float", "s-named")]);
    expect(r.faults).toEqual([{ personId: "float", fault: "SEAT_COVERED_TWICE" }]);
    expect(sit([here("float", "s-money")]).voterIds).toEqual(["float"]);
  });

  it("reports an attendee who holds no seat", () => {
    expect(sit([here("stranger")]).faults).toEqual([{ personId: "stranger", fault: "NOT_A_MEMBER" }]);
  });

  it("ignores an absence", () => {
    expect(sit([{ personId: "chief", attended: false, standingInForSeatId: null }]).voterIds).toEqual([]);
  });
});

describe("quorumFaults", () => {
  it("reports a quorum that exceeds the voting seats", () => {
    expect(quorumFaults({ quorum: 3, votingSeats: 2 })).toEqual(["QUORUM_EXCEEDS_VOTING_SEATS"]);
  });
  it("accepts a quorum within them, and says nothing about an unset one", () => {
    expect(quorumFaults({ quorum: 3, votingSeats: 3 })).toEqual([]);
    expect(quorumFaults({ quorum: null, votingSeats: 0 })).toEqual([]);
  });
});
