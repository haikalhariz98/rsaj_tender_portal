import { describe, expect, it } from "vitest";

import type { Roster } from "@/lib/people/roster";
import type { Person } from "@/lib/people/types";

import {
  assessFromRegister,
  assessSitting,
  checkAttendanceChange,
  isRegisterSnapshot,
  minutingChecks,
  resolveRegister,
  snapshotRegister,
} from "./assess-sitting";
import { registerRole, type Seat } from "./sitting";

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

describe("checkAttendanceChange (send-backs 8.6, review 2)", () => {
  const rules = { quorum: 2, votingRule: "SIMPLE_MAJORITY" as const, alternateMayVoteForRecused: null };
  const register = resolveRegister({
    meetingDate: d("2026-03-01"), seats, roster,
    attendance: [here("chief"), here("money"), here("named")],
  });
  const pending = {
    id: "P", act: "R", tabled: true, outcome: "PENDING" as const, dependencyOutcome: null, recusedIds: [],
    votes: [{ personId: "named", choice: "SETUJU" as const }],
  };

  it("refuses a change that makes a vote on a pending matter ineligible", () => {
    const r = checkAttendanceChange(register, rules, [pending], [here("chief"), here("money"), { personId: "named", attended: false, standingInForSeatId: null }]);
    expect(r.ok).toBe(false);
    expect(r.newlyIneligible).toEqual([{ matterId: "P", personId: "named" }]);
  });

  it("refuses a change that creates a fault for someone else", () => {
    // The alternate is already recorded covering m2; marking the holder present faults the alternate.
    const reg = resolveRegister({ meetingDate: d("2026-03-01"), seats, roster, attendance: [here("chief"), here("alt", "m2")] });
    const r = checkAttendanceChange(reg, rules, [], [here("chief"), here("alt", "m2"), here("named")]);
    expect(r.ok).toBe(false);
    expect(r.newFaults).toEqual([{ personId: "alt", fault: "STAND_IN_WHILE_HOLDER_PRESENT" }]);
  });

  it("refuses a change that breaks a decided matter", () => {
    const carried = {
      id: "C", act: "R", tabled: true, outcome: "CARRIED" as const, dependencyOutcome: null, recusedIds: [],
      votes: [{ personId: "chief", choice: "SETUJU" as const }, { personId: "money", choice: "SETUJU" as const }],
      snapshot: { quorum: 2, votingRule: "SIMPLE_MAJORITY" as const, alternateMayVoteForRecused: null },
    };
    const reg = resolveRegister({ meetingDate: d("2026-03-01"), seats, roster, attendance: [here("chief"), here("money")] });
    const r = checkAttendanceChange(reg, rules, [carried], [here("chief"), here("money"), here("named")]);
    expect(r.brokenDecisions).toEqual(["C"]);
    expect(r.ok).toBe(false);
  });

  it("allows an ordinary arrival", () => {
    expect(checkAttendanceChange(register, rules, [pending], [here("chief"), here("money"), here("named"), here("sec")]).ok).toBe(true);
  });
});

describe("minutingChecks and snapshots", () => {
  it("counts register faults and decisions that no longer hold", () => {
    const a = assessSitting({
      meetingDate: d("2026-03-01"), seats, roster, quorum: 2, votingRule: "SIMPLE_MAJORITY",
      attendance: [here("chief"), here("stranger-id")],
      matters: [],
    });
    expect(minutingChecks(a, []).registerFaults).toBe(1);
  });

  it("a snapshot survives a later change of roster", () => {
    const reg = resolveRegister({ meetingDate: d("2026-03-01"), seats, roster, attendance: [here("chief"), here("money")] });
    const snap = snapshotRegister(reg, { quorum: 2, votingRule: "SIMPLE_MAJORITY", votingRuleProvenance: "STATED", alternateMayVoteForRecused: null }, "Board", { chief: "chief" });
    expect(isRegisterSnapshot(snap)).toBe(true);
    const later = assessFromRegister(snap.register, snap.rules, [{
      id: "M", act: "R", tabled: true, outcome: "CARRIED", dependencyOutcome: null, recusedIds: [],
      votes: [{ personId: "chief", choice: "SETUJU" }, { personId: "money", choice: "SETUJU" }],
      snapshot: { quorum: 2, votingRule: "SIMPLE_MAJORITY", alternateMayVoteForRecused: null },
    }]);
    expect(later.matters.M.canRecord).toBe(true);
    expect(later.voting.find((v) => v.seatId === "chair")?.personId).toBe("chief");
  });
});

describe("contested office (send-back 8.4)", () => {
  it("names the contested office rather than calling the holder a non-member", () => {
    const twice: Roster = {
      ...roster,
      assignments: [
        ...roster.assignments,
        { id: "a9", personId: "named", roleCode: "MONEY", scope: null, effectiveFrom: d("2024-01-01"), effectiveTo: null },
      ],
    };
    const reg = resolveRegister({ meetingDate: d("2026-03-01"), seats, roster: twice, attendance: [here("money")] });
    expect(reg.present.faults).toEqual([{ personId: "money", fault: "OFFICE_CONTESTED", seatId: "m1" }]);
    expect(registerRole(reg, "money")).toMatchObject({ kind: "CONTESTED" });
  });
});

describe("checkRegisterChange (send-back 9.4)", () => {
  it("refuses a role change that takes a voter's seat away mid-sitting", async () => {
    const { checkRegisterChange } = await import("./assess-sitting");
    const attendance = [here("chief"), here("money"), here("named")];
    const before = resolveRegister({ meetingDate: d("2026-03-01"), seats, roster, attendance });
    // The Money office passes to someone else, dated before the sitting.
    const moved: Roster = {
      ...roster,
      assignments: roster.assignments.map((x) => (x.roleCode === "MONEY" ? { ...x, personId: "alt" } : x)),
    };
    const after = resolveRegister({ meetingDate: d("2026-03-01"), seats, roster: moved, attendance });
    const pending = {
      id: "P", act: "R", tabled: true, outcome: "PENDING" as const, dependencyOutcome: null, recusedIds: [],
      votes: [{ personId: "money", choice: "SETUJU" as const }],
    };
    const r = checkRegisterChange(before, after, { quorum: 2, votingRule: "SIMPLE_MAJORITY", alternateMayVoteForRecused: null }, [pending]);
    expect(r.ok).toBe(false);
    expect(r.newlyIneligible).toEqual([{ matterId: "P", personId: "money" }]);
  });
});

describe("acceptance send-back 1: a recusal that would void a vote already cast", () => {
  it("refuses a holder's recusal after their alternate stood in and voted", async () => {
    const { checkRecusalChange } = await import("./assess-sitting");
    // Holder of m2 (named) absent; the linked alternate stands in and votes.
    const register = resolveRegister({
      meetingDate: d("2026-03-01"), seats, roster,
      attendance: [here("chief"), here("money"), here("alt", "m2")],
    });
    const matter = {
      id: "X", act: "R", tabled: true, outcome: "PENDING" as const, dependencyOutcome: null, recusedIds: [],
      votes: [{ personId: "alt", choice: "SETUJU" as const }],
    };
    const rules = { quorum: 2, votingRule: "SIMPLE_MAJORITY" as const, alternateMayVoteForRecused: false };
    const r = checkRecusalChange(register, rules, matter, "named");
    expect(r).toEqual({ ok: false, newlyIneligible: ["alt"] });
    // Before anyone has voted in the seat, the same recusal is accepted.
    expect(checkRecusalChange(register, rules, { ...matter, votes: [] }, "named").ok).toBe(true);
  });
});

describe("acceptance send-back 2: a decided matter keeps the alternate rule it was decided under", () => {
  it("clearing the committee setting later does not unmake the decision", () => {
    // Holder of m2 recused, has an alternate; decided with the setting "No".
    const register = resolveRegister({ meetingDate: d("2026-03-01"), seats, roster, attendance: [here("chief"), here("money")] });
    const carried = {
      id: "C", act: "R", tabled: true, outcome: "CARRIED" as const, dependencyOutcome: null, recusedIds: ["named"],
      votes: [{ personId: "chief", choice: "SETUJU" as const }, { personId: "money", choice: "SETUJU" as const }],
      snapshot: { quorum: 2, votingRule: "SIMPLE_MAJORITY" as const, alternateMayVoteForRecused: false },
    };
    const cleared = { quorum: 2, votingRule: "SIMPLE_MAJORITY" as const, alternateMayVoteForRecused: null };
    const a = assessFromRegister(register, cleared, [carried]);
    expect(a.matters.C.canRecord).toBe(true);
    expect(minutingChecks(a, [carried]).brokenDecisions).toBe(0);
    // Without the snapshot, the live (cleared) setting would block it: what the snapshot prevents.
    const live = assessFromRegister(register, cleared, [{ ...carried, snapshot: undefined }]);
    expect(live.matters.C.blockers).toContain("ALTERNATE_FOR_RECUSED_UNCONFIGURED");
  });
});

describe("assessFromRegister: the sitting's status (6.10 local review 1)", () => {
  const matter = { id: "X", act: "R", tabled: true, outcome: "PENDING" as const, dependencyOutcome: null, recusedIds: [], votes: [] };
  const register = resolveRegister({ meetingDate: d("2026-03-01"), seats, roster, attendance: [] });
  const rules = { quorum: 2, votingRule: "SIMPLE_MAJORITY" as const, alternateMayVoteForRecused: null };

  it("a scheduled sitting has no register yet: not started, never not quorate", () => {
    const a = assessFromRegister(register, rules, [matter], "SCHEDULED");
    expect(a.registerTaken).toBe(false);
    expect(a.matters.X.registerTaken).toBe(false);
    expect(a.matters.X.blockers).toEqual(["SITTING_NOT_STARTED"]);
  });

  it("the same sitting in progress, with nobody recorded, is not quorate", () => {
    const a = assessFromRegister(register, rules, [matter], "IN_PROGRESS");
    expect(a.registerTaken).toBe(true);
    expect(a.matters.X.blockers).toContain("QUORUM_NOT_MET");
  });

  it("assessSitting passes the status through", () => {
    const a = assessSitting({ meetingDate: d("2026-03-01"), seats, roster, quorum: 2, votingRule: "SIMPLE_MAJORITY", attendance: [], matters: [matter], status: "SCHEDULED" });
    expect(a.matters.X.blockers).toEqual(["SITTING_NOT_STARTED"]);
  });
});
