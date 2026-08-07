import { describe, expect, it } from "vitest";

import { assessDecision, assessQuorum, tallyVotes, type VoteChoice } from "./quorum";

const votes = (...choices: VoteChoice[]) => choices.map((choice) => ({ choice }));

describe("quorum", () => {
  it("is met when attendance reaches the stated number", () => {
    // The Tender Board's three members — the only quorum stated anywhere in the
    // pre-award corpus (SK003 7.6.2).
    expect(assessQuorum({ quorum: 3, present: 3 })).toMatchObject({ state: "MET", shortfall: 0 });
    expect(assessQuorum({ quorum: 3, present: 5 })).toMatchObject({ state: "MET", shortfall: 0 });
  });

  it("is not met below it, and says how far short", () => {
    const result = assessQuorum({ quorum: 3, present: 1 });
    expect(result.state).toBe("NOT_MET");
    expect(result.shortfall).toBe(2);
    expect(result.messageEn).toContain("2 short");
  });

  // The distinction the specification forces: §5.2 records that the DAL states no
  // quorum for any committee. An unstated quorum is not a quorum of zero.
  it("reports UNCONFIGURED when no quorum is stated, never MET", () => {
    const result = assessQuorum({ quorum: null, present: 9 });
    expect(result.state).toBe("UNCONFIGURED");
    expect(result.required).toBeNull();
    expect(result.shortfall).toBeNull();
    expect(result.messageEn).toContain("No quorum has been set");
  });

  it("does not treat a full room as quorate when the rule is unwritten", () => {
    expect(assessQuorum({ quorum: null, present: 100 }).state).not.toBe("MET");
  });
});

describe("vote tally", () => {
  it("counts each choice and what is outstanding", () => {
    const tally = tallyVotes(votes("SETUJU", "SETUJU", "TIDAK_SETUJU", "ABSTAIN"), 6);
    expect(tally).toMatchObject({ setuju: 2, tidakSetuju: 1, abstain: 1, cast: 4, notVoted: 2 });
  });

  it("carries on a simple majority of votes cast", () => {
    expect(tallyVotes(votes("SETUJU", "SETUJU", "TIDAK_SETUJU"), 3).carried).toBe(true);
  });

  // Nothing in the corpus gives the chair a casting vote, so a tie must not carry.
  it("does not carry on a tie", () => {
    expect(tallyVotes(votes("SETUJU", "TIDAK_SETUJU"), 2).carried).toBe(false);
  });

  it("does not carry on abstentions alone", () => {
    expect(tallyVotes(votes("ABSTAIN", "ABSTAIN"), 2).carried).toBe(false);
  });

  it("never reports negative outstanding when more vote than were entitled", () => {
    expect(tallyVotes(votes("SETUJU", "SETUJU", "SETUJU"), 2).notVoted).toBe(0);
  });
});

describe("recording a decision", () => {
  it("allows a quorate simple recommendation once anyone has voted", () => {
    const result = assessDecision({
      act: "R",
      quorum: 3,
      present: 3,
      entitledCount: 4,
      votes: votes("SETUJU", "SETUJU"),
    });
    expect(result.canRecord).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.messageEn).toContain("Carried");
  });

  it("blocks when the sitting is not quorate", () => {
    const result = assessDecision({
      act: "R",
      quorum: 3,
      present: 2,
      entitledCount: 4,
      votes: votes("SETUJU", "SETUJU"),
    });
    expect(result.canRecord).toBe(false);
    expect(result.blockers).toContain("QUORUM_NOT_MET");
  });

  it("blocks when no quorum has ever been configured", () => {
    const result = assessDecision({
      act: "MR",
      quorum: null,
      present: 4,
      entitledCount: 4,
      votes: votes("SETUJU", "SETUJU", "SETUJU", "SETUJU"),
    });
    expect(result.canRecord).toBe(false);
    expect(result.blockers).toContain("QUORUM_UNCONFIGURED");
    expect(result.messageEn).toContain("no quorum has been set");
  });

  // A mandatory recommendation is the DAL's strongest committee step: the Quotation
  // Committee's MR on a RM180,000 appointment cannot be given by half the body.
  it("requires every entitled member to vote on a mandatory recommendation", () => {
    const partial = assessDecision({
      act: "MR",
      quorum: 3,
      present: 4,
      entitledCount: 4,
      votes: votes("SETUJU", "SETUJU", "SETUJU"),
    });
    expect(partial.mandatory).toBe(true);
    expect(partial.canRecord).toBe(false);
    expect(partial.blockers).toContain("MEMBERS_OUTSTANDING");
    expect(partial.messageEn).toContain("all members must vote");

    const complete = assessDecision({
      act: "MR",
      quorum: 3,
      present: 4,
      entitledCount: 4,
      votes: votes("SETUJU", "SETUJU", "SETUJU", "TIDAK_SETUJU"),
    });
    expect(complete.canRecord).toBe(true);
  });

  it("does not impose that stricter test on a simple recommendation", () => {
    const result = assessDecision({
      act: "R",
      quorum: 3,
      present: 4,
      entitledCount: 4,
      votes: votes("SETUJU"),
    });
    expect(result.mandatory).toBe(false);
    expect(result.blockers).not.toContain("MEMBERS_OUTSTANDING");
    expect(result.canRecord).toBe(true);
  });

  it("blocks before any vote is cast", () => {
    const result = assessDecision({
      act: "R",
      quorum: 3,
      present: 3,
      entitledCount: 4,
      votes: [],
    });
    expect(result.canRecord).toBe(false);
    expect(result.blockers).toContain("NO_VOTES_CAST");
  });

  it("records a decision that is quorate and complete but not carried", () => {
    const result = assessDecision({
      act: "MR",
      quorum: 3,
      present: 4,
      entitledCount: 4,
      votes: votes("SETUJU", "TIDAK_SETUJU", "TIDAK_SETUJU", "TIDAK_SETUJU"),
    });
    expect(result.canRecord).toBe(true);
    expect(result.tally.carried).toBe(false);
    expect(result.messageEn).toContain("Not carried");
  });
});
