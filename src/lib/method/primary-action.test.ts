import { describe, expect, it } from "vitest";

import { exercisePrimary, type ExercisePrimaryFacts } from "./primary-action";

const f = (over: Partial<ExercisePrimaryFacts>): ExercisePrimaryFacts => ({ status: "DRAFT", windowPhase: null, requiresProposal: false, proposalState: null, noPack: false, liveAward: false, ...over });
const label = (over: Partial<ExercisePrimaryFacts>) => {
  const p = exercisePrimary(f(over));
  return p ? (p.kind === "link" ? p.label : p.kind) : null;
};

describe("the exercise header's one primary action", () => {
  it("a draft moves to preparation, after the proposal where the method asks for one", () => {
    expect(label({})).toBe("move_to_preparation");
    expect(label({ requiresProposal: true, proposalState: "DRAFT" })).toBe("submit_proposal");
    expect(label({ requiresProposal: true, proposalState: "SUBMITTED" })).toBe("review_proposal");
    expect(label({ requiresProposal: true, proposalState: "REVIEWED" })).toBe("move_to_preparation");
  });
  it("each later status points at the step in hand", () => {
    expect(label({ status: "DOCUMENTS_IN_PREPARATION" })).toBe("Finish the tender documents");
    expect(label({ status: "DOCUMENTS_IN_PREPARATION", noPack: true })).toBe("Open the award");
    expect(label({ status: "APPROVED_FOR_TENDERING" })).toBe("Publish");
    expect(label({ status: "ADVERTISED", windowPhase: "OPEN_FOR_PURCHASE" })).toBe("See the bids");
    expect(label({ status: "ADVERTISED", windowPhase: "CLOSED" })).toBe("Open the bids");
    expect(label({ status: "OPENED" })).toBe("Start the evaluation");
    expect(label({ status: "EVALUATED" })).toBe("Open the award");
  });
  it("a cancelled exercise, and one with a standing award, has none", () => {
    expect(label({ status: "CANCELLED" })).toBeNull();
    expect(label({ status: "EVALUATED", liveAward: true })).toBeNull();
  });
});
