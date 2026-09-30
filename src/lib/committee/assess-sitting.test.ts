import { describe, expect, it } from "vitest";

import type { Roster } from "@/lib/people/roster";
import type { Person } from "@/lib/people/types";

import { assessSitting } from "./assess-sitting";
import type { Seat } from "./sitting";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const person = (id: string): Person => ({
  id, staffNo: null, name: id, email: null, jobTitle: null, jobTitleMs: null, department: null,
  telephone: null, portalRoleCode: null, authorityLevel: null, isAvailable: true, isActive: true,
});
const seat = (s: Partial<Seat> & Pick<Seat, "id" | "position">): Seat => ({
  personId: null, seatRoleCode: null, seatLabel: null, isAlternate: false, alternateForId: null,
  effectiveFrom: d("2024-01-01"), effectiveTo: null, ...s,
});

// Ex-officio chair and member, a named member with a linked alternate, a Secretary.
const roster: Roster = {
  people: ["chief", "money", "named", "alt", "sec"].map(person),
  offices: [],
  assignments: [
    { id: "a1", personId: "chief", roleCode: "CHIEF", scope: null, effectiveFrom: d("2024-01-01"), effectiveTo: null },
    { id: "a2", personId: "money", roleCode: "MONEY", scope: null, effectiveFrom: d("2024-01-01"), effectiveTo: null },
  ],
};
const seats: Seat[] = [
  seat({ id: "chair", position: "CHAIRMAN", seatRoleCode: "CHIEF" }),
  seat({ id: "m1", position: "MEMBER", seatRoleCode: "MONEY" }),
  seat({ id: "m2", position: "MEMBER", personId: "named" }),
  seat({ id: "m2alt", position: "MEMBER", personId: "alt", isAlternate: true, alternateForId: "m2" }),
  seat({ id: "sec", position: "SECRETARY", personId: "sec" }),
];
const here = (personId: string, standingInForSeatId: string | null = null) => ({ personId, attended: true, standingInForSeatId });

describe("assessSitting", () => {
  it("lets ex-officio members vote (D1) and keeps the Secretary out of the count", () => {
    const a = assessSitting({
      meetingDate: d("2026-03-01"), seats, roster, quorum: 3, votingRule: "SIMPLE_MAJORITY",
      attendance: [here("chief"), here("money"), here("sec"), here("alt", "m2")],
      matters: [],
    });
    expect(a.present.voterIds.sort()).toEqual(["alt", "chief", "money"]);
    expect(a.present.faults).toEqual([]);
  });

  it("judges each matter on its own recusals: X inquorate, Y quorate, in one sitting", () => {
    const votes = [
      { personId: "chief", choice: "SETUJU" as const },
      { personId: "money", choice: "SETUJU" as const },
      { personId: "named", choice: "SETUJU" as const },
    ];
    const a = assessSitting({
      meetingDate: d("2026-03-01"), seats, roster, quorum: 3, votingRule: "SIMPLE_MAJORITY",
      attendance: [here("chief"), here("money"), here("named")],
      matters: [
        { id: "X", act: "R", tabled: true, outcome: "PENDING", dependencyOutcome: null, recusedIds: ["money"], votes: votes.filter((v) => v.personId !== "money") },
        { id: "Y", act: "R", tabled: true, outcome: "PENDING", dependencyOutcome: null, recusedIds: [], votes },
      ],
    });
    expect(a.matters.X.blockers).toContain("QUORUM_NOT_MET");
    expect(a.matters.X.quorum.shortfall).toBe(1);
    expect(a.matters.Y.canRecord).toBe(true);
  });

  it("a mandatory act is met when an alternate covers the absent holder's seat", () => {
    const a = assessSitting({
      meetingDate: d("2026-03-01"), seats, roster, quorum: 3, votingRule: "SIMPLE_MAJORITY",
      attendance: [here("chief"), here("money"), here("alt", "m2")],
      matters: [{
        id: "M", act: "MR", tabled: true, outcome: "PENDING", dependencyOutcome: null, recusedIds: [],
        votes: ["chief", "money", "alt"].map((personId) => ({ personId, choice: "SETUJU" as const })),
      }],
    });
    expect(a.matters.M.canRecord).toBe(true);
  });
});
