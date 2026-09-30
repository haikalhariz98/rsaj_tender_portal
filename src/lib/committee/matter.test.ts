import { describe, expect, it } from "vitest";

import {
  assessMatter,
  canVote,
  checkOutcome,
  checkRecusal,
  combine,
  outcomesOffered,
  VOTE_FAULT_STATUS,
  type MatterInput,
} from "./matter";
import { tallyVotes, type VoteChoice } from "./quorum";

/*
 * A body of three voting seats (A, B, C) unless a case says otherwise. Quorum and
 * voting rule are set per case, as a customer would set them; nothing here is any
 * customer's figure.
 */

const seats = (...ids: string[]) => ids.map((id) => ({ seatId: `seat-${id}`, holderId: id }));
const sitting = (...ids: string[]) => ids.map((id) => ({ seatId: `seat-${id}`, personId: id }));
const v = (personId: string, choice: VoteChoice) => ({ personId, choice });

const base: MatterInput = {
  quorum: 3,
  votingRule: "SIMPLE_MAJORITY",
  act: "R",
  tabled: true,
  seats: seats("A", "B", "C"),
  occupants: sitting("A", "B", "C"),
  recusedIds: [],
  votes: [v("A", "SETUJU"), v("B", "SETUJU"), v("C", "TIDAK_SETUJU")],
  dependencyOutcome: null,
};

describe("assessMatter", () => {
  it("records when quorate, every present member voted, and a rule is set", () => {
    const a = assessMatter(base);
    expect(a.canRecord).toBe(true);
    expect(a.computed).toBe("CARRIED");
  });

  it("Tender Board, quorum 3, two present: cannot record, one short", () => {
    const a = assessMatter({
      ...base,
      occupants: sitting("A", "B"),
      votes: [v("A", "SETUJU"), v("B", "SETUJU")],
    });
    expect(a.canRecord).toBe(false);
    expect(a.blockers).toContain("QUORUM_NOT_MET");
    expect(a.quorum.shortfall).toBe(1);
    expect(a.messageEn).toContain("2 of 3");
    expect(a.messageEn).toContain("1 short");
  });

  it("three present, one vote outstanding: VOTES_OUTSTANDING, stricter than assessDecision", () => {
    const a = assessMatter({ ...base, votes: [v("A", "SETUJU"), v("B", "SETUJU")] });
    expect(a.blockers).toEqual(["VOTES_OUTSTANDING"]);
  });

  it("no individual votes at all: cannot record", () => {
    const a = assessMatter({ ...base, votes: [] });
    expect(a.canRecord).toBe(false);
    expect(a.blockers).toContain("VOTES_OUTSTANDING");
  });

  it("a recusal affects that matter's quorum only", () => {
    const x = assessMatter({ ...base, recusedIds: ["B"], votes: [v("A", "SETUJU"), v("C", "SETUJU")] });
    const y = assessMatter(base);
    expect(x.blockers).toContain("QUORUM_NOT_MET");
    expect(x.quorum.shortfall).toBe(1);
    expect(x.messageEn).toContain("1 short");
    expect(y.quorum.state).toBe("MET");
    expect(y.canRecord).toBe(true);
  });

  it("an unset quorum is never met, even with the whole body present", () => {
    const a = assessMatter({ ...base, quorum: null });
    expect(a.quorum.state).toBe("UNCONFIGURED");
    expect(a.blockers).toContain("QUORUM_UNCONFIGURED");
    expect(a.canRecord).toBe(false);
  });

  it("an unset voting rule blocks recording, and no majority is assumed", () => {
    const a = assessMatter({ ...base, votingRule: null });
    expect(a.blockers).toEqual(["VOTING_RULE_UNCONFIGURED"]);
    expect(a.computed).toBeNull();
    expect(a.canRecord).toBe(false);
  });

  it("a matter not tabled cannot be recorded", () => {
    expect(assessMatter({ ...base, tabled: false }).blockers).toContain("NOT_TABLED");
  });

  it("waits while the matter it depends on is pending", () => {
    expect(assessMatter({ ...base, dependencyOutcome: "PENDING" }).blockers).toContain("DEPENDENCY_PENDING");
    expect(assessMatter({ ...base, dependencyOutcome: "CARRIED" }).blockers).toEqual([]);
  });

  it("refuses a vote from someone who is absent or recused", () => {
    const absent = assessMatter({ ...base, occupants: sitting("A", "B", "C"), votes: [...base.votes, v("Z", "SETUJU")] });
    expect(absent.blockers).toContain("INELIGIBLE_VOTE");
    const recused = assessMatter({ ...base, recusedIds: ["C"], quorum: 2 });
    expect(recused.blockers).toContain("INELIGIBLE_VOTE");
  });

  describe("mandatory acts keep the full-voting-body rule (5.9)", () => {
    const four = { ...base, act: "MR", quorum: 3, seats: seats("A", "B", "C", "D") };

    it("MR, three of four voting seats present, all three vote: MANDATORY_ACT_NOT_FULL_BODY", () => {
      const a = assessMatter({ ...four, occupants: sitting("A", "B", "C") });
      expect(a.blockers).toEqual(["MANDATORY_ACT_NOT_FULL_BODY"]);
      expect(a.uncoveredSeatIds).toEqual(["seat-D"]);
    });

    it("MR, four seats, one recused, three present and voted: ok", () => {
      const a = assessMatter({ ...four, occupants: sitting("A", "B", "C"), recusedIds: ["D"] });
      expect(a.canRecord).toBe(true);
    });

    it("MR, a seat covered by a valid alternate counts as present", () => {
      const a = assessMatter({
        ...four,
        occupants: [...sitting("A", "B", "C"), { seatId: "seat-D", personId: "D-alt" }],
        votes: [...base.votes, v("D-alt", "SETUJU")],
      });
      expect(a.blockers).toEqual([]);
      expect(a.canRecord).toBe(true);
    });
  });
});

describe("voting rules", () => {
  it("UNANIMOUS with one TIDAK SETUJU is not carried", () => {
    const a = assessMatter({ ...base, votingRule: "UNANIMOUS" });
    expect(a.computed).toBe("NOT_CARRIED");
    expect(a.canRecord).toBe(true);
  });

  it("a tie is never carried, under either rule", () => {
    const tie = tallyVotes([{ choice: "SETUJU" }, { choice: "TIDAK_SETUJU" }], 2);
    expect(combine("SIMPLE_MAJORITY", tie)).toBe("NOT_CARRIED");
    expect(combine("UNANIMOUS", tie)).toBe("NOT_CARRIED");
  });

  it("UNANIMOUS carries when every vote cast is SETUJU", () => {
    const all = tallyVotes([{ choice: "SETUJU" }, { choice: "SETUJU" }], 2);
    expect(combine("UNANIMOUS", all)).toBe("CARRIED");
  });
});

describe("checkOutcome", () => {
  const ready = assessMatter(base);
  const notCarried = assessMatter({ ...base, votes: [v("A", "SETUJU"), v("B", "TIDAK_SETUJU"), v("C", "TIDAK_SETUJU")] });
  const on = new Date("2026-03-01T00:00:00Z");
  const outcomes = [
    { id: "loop", committeeId: null, retiredOn: null },
    { id: "end", committeeId: "tb", retiredOn: null },
    { id: "old", committeeId: null, retiredOn: new Date("2025-01-01T00:00:00Z") },
    { id: "other", committeeId: "qc", retiredOn: null },
  ];
  const ctx = { outcomes, committeeId: "tb", on };

  it("refuses an outcome while the matter has no individual votes", () => {
    const empty = assessMatter({ ...base, votes: [] });
    expect(checkOutcome(empty, { outcome: "CARRIED", notApprovedOutcomeId: null, note: "" }, ctx)).toEqual({
      ok: false,
      fault: "MATTER_NOT_READY",
    });
  });

  it("refuses CARRIED when the tally is not carried", () => {
    expect(checkOutcome(notCarried, { outcome: "CARRIED", notApprovedOutcomeId: null, note: "" }, ctx)).toEqual({
      ok: false,
      fault: "OUTCOME_CONTRADICTS_VOTES",
    });
  });

  it("records CARRIED when the votes carry it", () => {
    expect(checkOutcome(ready, { outcome: "CARRIED", notApprovedOutcomeId: null, note: "" }, ctx)).toEqual({ ok: true });
  });

  it("NOT_CARRIED with none chosen: OUTCOME_REQUIRED", () => {
    expect(checkOutcome(notCarried, { outcome: "NOT_CARRIED", notApprovedOutcomeId: null, note: "x" }, ctx)).toEqual({
      ok: false,
      fault: "OUTCOME_REQUIRED",
    });
  });

  it("NOT_CARRIED with zero configured: NO_OUTCOMES_CONFIGURED (5.5)", () => {
    expect(
      checkOutcome(notCarried, { outcome: "NOT_CARRIED", notApprovedOutcomeId: "loop", note: "x" }, { ...ctx, outcomes: [] }),
    ).toEqual({ ok: false, fault: "NO_OUTCOMES_CONFIGURED" });
  });

  it("NOT_CARRIED with a retired outcome or another committee's: OUTCOME_NOT_OFFERED", () => {
    for (const id of ["old", "other"]) {
      expect(checkOutcome(notCarried, { outcome: "NOT_CARRIED", notApprovedOutcomeId: id, note: "x" }, ctx)).toEqual({
        ok: false,
        fault: "OUTCOME_NOT_OFFERED",
      });
    }
  });

  it("NOT_CARRIED with a valid LOOP or TERMINAL outcome and a note: ok", () => {
    for (const id of ["loop", "end"]) {
      expect(checkOutcome(notCarried, { outcome: "NOT_CARRIED", notApprovedOutcomeId: id, note: "Why" }, ctx)).toEqual({ ok: true });
    }
    expect(checkOutcome(notCarried, { outcome: "NOT_CARRIED", notApprovedOutcomeId: "loop", note: " " }, ctx)).toEqual({
      ok: false,
      fault: "NOTE_REQUIRED",
    });
  });

  it("DEFERRED needs a note but neither quorum nor votes", () => {
    const inquorate = assessMatter({ ...base, occupants: sitting("A"), votes: [] });
    expect(checkOutcome(inquorate, { outcome: "DEFERRED", notApprovedOutcomeId: null, note: "Recusal left it inquorate" }, ctx)).toEqual({ ok: true });
    expect(checkOutcome(inquorate, { outcome: "DEFERRED", notApprovedOutcomeId: null, note: "" }, ctx)).toEqual({
      ok: false,
      fault: "NOTE_REQUIRED",
    });
  });

  it("offers a committee its own outcomes and the shared ones, unretired", () => {
    expect(outcomesOffered(outcomes, "tb", on).map((o) => o.id)).toEqual(["loop", "end"]);
  });
});

describe("canVote", () => {
  const ok = {
    meetingStatus: "IN_PROGRESS" as const,
    meetingDate: new Date("2026-03-01T00:00:00Z"),
    today: "2026-03-05",
    outcome: "PENDING" as const,
    tabled: true,
    personId: "A",
    presentVoterIds: ["A", "B", "C"],
    recusedIds: [] as string[],
    choice: "SETUJU",
    votedAt: "2026-03-01",
  };

  it("accepts a present, non-recused voter on an open matter", () => {
    expect(canVote(ok)).toEqual({ ok: true });
  });

  it("refuses ABSTAIN with 422", () => {
    const r = canVote({ ...ok, choice: "ABSTAIN" });
    expect(r).toEqual({ ok: false, fault: "ABSTAIN_REFUSED" });
    expect(VOTE_FAULT_STATUS.ABSTAIN_REFUSED).toBe(422);
  });

  it("refuses a recused member on that matter with 403", () => {
    const r = canVote({ ...ok, personId: "B", recusedIds: ["B"] });
    expect(r).toEqual({ ok: false, fault: "RECUSED" });
    expect(VOTE_FAULT_STATUS.RECUSED).toBe(403);
  });

  it("refuses someone not present with 403", () => {
    expect(canVote({ ...ok, personId: "Z" })).toEqual({ ok: false, fault: "NOT_A_PRESENT_VOTER" });
    expect(VOTE_FAULT_STATUS.NOT_A_PRESENT_VOTER).toBe(403);
  });

  it("refuses on a minuted, cancelled or scheduled sitting, or a decided matter, with 409", () => {
    expect(canVote({ ...ok, meetingStatus: "MINUTED" })).toEqual({ ok: false, fault: "MEETING_CLOSED" });
    expect(canVote({ ...ok, meetingStatus: "CANCELLED" })).toEqual({ ok: false, fault: "MEETING_CLOSED" });
    expect(canVote({ ...ok, meetingStatus: "SCHEDULED" })).toEqual({ ok: false, fault: "MEETING_NOT_STARTED" });
    expect(canVote({ ...ok, outcome: "CARRIED" })).toEqual({ ok: false, fault: "MATTER_DECIDED" });
    for (const f of ["MEETING_CLOSED", "MEETING_NOT_STARTED", "MATTER_DECIDED"] as const) {
      expect(VOTE_FAULT_STATUS[f]).toBe(409);
    }
  });

  it("says a sitting not yet held has not started, rather than blaming the date", () => {
    const future = { ...ok, meetingStatus: "SCHEDULED" as const, meetingDate: new Date("2026-04-01T00:00:00Z") };
    expect(canVote(future)).toEqual({ ok: false, fault: "MEETING_NOT_STARTED" });
  });

  it("refuses a sheet date after today or before the sitting with 422", () => {
    expect(canVote({ ...ok, votedAt: "2026-03-06" })).toEqual({ ok: false, fault: "DATE_IN_FUTURE" });
    expect(canVote({ ...ok, votedAt: "2026-02-28" })).toEqual({ ok: false, fault: "DATE_BEFORE_SITTING" });
    expect(VOTE_FAULT_STATUS.DATE_IN_FUTURE).toBe(422);
    expect(canVote({ ...ok, votedAt: "2026-03-05" })).toEqual({ ok: true });
  });

  it("answers malformed input with 400", () => {
    expect(canVote({ ...ok, choice: "YES" })).toEqual({ ok: false, fault: "INVALID_CHOICE" });
    expect(canVote({ ...ok, votedAt: "5 March" })).toEqual({ ok: false, fault: "INVALID_DATE" });
    expect(VOTE_FAULT_STATUS.INVALID_CHOICE).toBe(400);
  });
});

describe("checkRecusal", () => {
  const ok = {
    meetingStatus: "SCHEDULED" as const,
    outcome: "PENDING" as const,
    role: "VOTING" as const,
    alreadyRecused: false,
    hasVoted: false,
  };
  it("is open before the sitting and during it (ruling 8.2)", () => {
    expect(checkRecusal(ok)).toEqual({ ok: true });
    expect(checkRecusal({ ...ok, meetingStatus: "IN_PROGRESS" })).toEqual({ ok: true });
    expect(checkRecusal({ ...ok, role: "ALTERNATE" })).toEqual({ ok: true });
  });
  it("is refused after voting, on a decided matter, a closed sitting or a non-voter", () => {
    expect(checkRecusal({ ...ok, hasVoted: true })).toEqual({ ok: false, fault: "ALREADY_VOTED" });
    expect(checkRecusal({ ...ok, outcome: "CARRIED" })).toEqual({ ok: false, fault: "MATTER_DECIDED" });
    expect(checkRecusal({ ...ok, meetingStatus: "MINUTED" })).toEqual({ ok: false, fault: "SITTING_CLOSED" });
    expect(checkRecusal({ ...ok, role: "NON_VOTING" })).toEqual({ ok: false, fault: "NOT_A_VOTING_MEMBER" });
    expect(checkRecusal({ ...ok, alreadyRecused: true })).toEqual({ ok: false, fault: "ALREADY_RECUSED" });
  });
});

describe("recusal and alternates (send-back 8.5)", () => {
  const withAlt = { ...base, seats: [{ seatId: "seat-A", holderId: "A" }, { seatId: "seat-B", holderId: "B", hasAlternate: true }, { seatId: "seat-C", holderId: "C" }] };

  it("unset: blocks a matter where a recused member's seat has an alternate, naming the setting", () => {
    const a = assessMatter({ ...withAlt, quorum: 2, recusedIds: ["B"], votes: [v("A", "SETUJU"), v("C", "SETUJU")] });
    expect(a.blockers).toEqual(["ALTERNATE_FOR_RECUSED_UNCONFIGURED"]);
    expect(a.messageEn).toContain("alternate may vote");
  });

  it("unset: does not block a matter where no alternate could cover the recused seat", () => {
    const a = assessMatter({ ...base, quorum: 2, recusedIds: ["B"], votes: [v("A", "SETUJU"), v("C", "SETUJU")] });
    expect(a.blockers).toEqual([]);
  });

  it("the holder's attendance does not change whether their seat votes", () => {
    const common = { ...withAlt, quorum: 2, alternateMayVoteForRecused: false, recusedIds: ["B"] };
    const holderPresent = assessMatter({ ...common, occupants: sitting("A", "B", "C"), votes: [v("A", "SETUJU"), v("C", "SETUJU")] });
    const altCovering = assessMatter({
      ...common,
      occupants: [...sitting("A", "C"), { seatId: "seat-B", personId: "B-alt" }],
      votes: [v("A", "SETUJU"), v("C", "SETUJU")],
    });
    for (const a of [holderPresent, altCovering]) {
      expect(a.entitledIds.sort()).toEqual(["A", "C"]);
      expect(a.excusedSeatIds).toEqual(["seat-B"]);
      expect(a.canRecord).toBe(true);
    }
    // A vote from the alternate on that matter is not entitled, and shows as such.
    const altVoted = assessMatter({
      ...common,
      occupants: [...sitting("A", "C"), { seatId: "seat-B", personId: "B-alt" }],
      votes: [v("A", "SETUJU"), v("C", "SETUJU"), v("B-alt", "SETUJU")],
    });
    expect(altVoted.blockers).toContain("INELIGIBLE_VOTE");
    expect(altVoted.ineligibleVoterIds).toEqual(["B-alt"]);
  });

  it("counts the recusals among those present only", () => {
    const present = assessMatter({ ...base, quorum: 2, recusedIds: ["B"], votes: [v("A", "SETUJU"), v("C", "SETUJU")] });
    expect(present.recusedPresentIds).toEqual(["B"]);
    expect(present.entitledIds.length).toBe(2);
    const absent = assessMatter({ ...base, quorum: 2, occupants: sitting("A", "C"), recusedIds: ["B"], votes: [v("A", "SETUJU"), v("C", "SETUJU")] });
    expect(absent.recusedPresentIds).toEqual([]);
  });
});

describe("blocker wording", () => {
  it("says how many more members a matter needs, and names configuration gaps once", async () => {
    const { blockerShort, configurationGapLine } = await import("./labels");
    const a = assessMatter({ ...base, occupants: sitting("A", "B"), votes: [v("A", "SETUJU"), v("B", "SETUJU")] });
    expect(blockerShort(a)).toBe("Needs 1 more voting member present");
    expect(blockerShort(assessMatter(base))).toBeNull();
    expect(configurationGapLine(["QUORUM_UNCONFIGURED", "VOTING_RULE_UNCONFIGURED", "VOTES_OUTSTANDING"])).toBe(
      "Can't be decided until the committee's quorum and voting rule are set.",
    );
  });
});

describe("time zone unset (ruling 9.5)", () => {
  it("refuses a vote while the organisation has no time zone", () => {
    const r = canVote({
      meetingStatus: "IN_PROGRESS", meetingDate: new Date("2026-03-01T00:00:00Z"), today: null, outcome: "PENDING",
      tabled: true, personId: "A", presentVoterIds: ["A"], recusedIds: [], choice: "SETUJU", votedAt: "2026-03-01",
    });
    expect(r).toEqual({ ok: false, fault: "TIME_ZONE_UNSET" });
    expect(VOTE_FAULT_STATUS.TIME_ZONE_UNSET).toBe(409);
  });
});
