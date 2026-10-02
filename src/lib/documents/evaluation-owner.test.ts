import { describe, expect, it } from "vitest";

import { attachFault, detachFault, ownerState, purposeFits, reliedOn, type OwnerFacts } from "./attach";
import { EXIT_TEXT, documentFaultText } from "./labels";
import { evaluationBidderFacts, evaluationFacts, evaluationMeetingFacts } from "./owner-facts";
import { ownerHref } from "./targets";
import { PURPOSE_CLASSIFICATION } from "./types";

/**
 * 6.8 (X-6, E-3, NFR-SEC-002): an evaluation version keeps its report's drawings (while open: annex F
 * lists them at issue), its signed report (once issued) and its signed Kertas Cadangan (once both
 * signers are recorded); a meeting keeps its minutes and the tenderer's confirmation until it is
 * closed; a bidder keeps a CPR report (the CPR entered stands on it) and its written communications.
 * Every one SULIT at upload; a superseded or cancelled version keeps what it has.
 */

const sulit = { version: { withdrawnAt: null }, documentClass: { classification: "SULIT" as const } };
const internal = { version: { withdrawnAt: null }, documentClass: { classification: "INTERNAL" as const } };
type State = "OPEN" | "ISSUED" | "SUPERSEDED" | "CANCELLED";
const evaluation = (state: State, signed = false, status: "UNDER_EVALUATION" | "EVALUATED" | "CANCELLED" = "UNDER_EVALUATION"): OwnerFacts =>
  evaluationFacts({ state, exercise: { status }, proposalPaper: signed ? { checkedByPersonId: "p1", recommendedByPersonId: "p2" } : { checkedByPersonId: "p1", recommendedByPersonId: null } });
const meeting = (closed: boolean, state: State = "OPEN"): OwnerFacts => evaluationMeetingFacts({ closedAt: closed ? new Date() : null, evaluation: { state, exercise: { status: "UNDER_EVALUATION" } } });
const bidder = (cpr: string | null, state: State = "OPEN"): OwnerFacts => evaluationBidderFacts({ cprPercent: cpr, evaluation: { state, exercise: { status: "UNDER_EVALUATION" } } });

describe("every evaluation purpose is SULIT at upload (E-3)", () => {
  it.each(["CPR_REPORT", "COMMUNICATION", "MEETING_MINUTES", "TENDERER_CONFIRMATION", "REPORT_DRAWINGS", "SIGNED_REPORT", "SIGNED_PROPOSAL_PAPER"] as const)("%s", (purpose) => {
    expect(PURPOSE_CLASSIFICATION[purpose]).toBe("SULIT");
  });
  it("refuses an INTERNAL document", () => {
    expect(attachFault({ purpose: "CPR_REPORT", owner: bidder(null), ...internal }).map((f) => f.code)).toEqual(["CLASSIFICATION_BELOW_PURPOSE"]);
    expect(attachFault({ purpose: "CPR_REPORT", owner: bidder(null), ...sulit })).toEqual([]);
  });
});

describe("the evaluation version as an owner", () => {
  it("takes only its own three purposes", () => {
    expect(purposeFits("REPORT_DRAWINGS", evaluation("OPEN"))).toBe(true);
    expect(purposeFits("CPR_REPORT", evaluation("OPEN"))).toBe(false);
  });
  it("drawings while open, frozen once issued (the report listed them)", () => {
    expect(ownerState("REPORT_DRAWINGS", evaluation("OPEN"))).toEqual({ state: "OPEN" });
    expect(ownerState("REPORT_DRAWINGS", evaluation("ISSUED", false, "EVALUATED"))).toEqual({ state: "FROZEN", exit: "REPORT_ISSUED" });
  });
  it("the signed report once issued; the signed Kertas Cadangan once both signers are recorded", () => {
    expect(ownerState("SIGNED_REPORT", evaluation("OPEN"))).toEqual({ state: "NOT_READY", exit: "REPORT_NOT_ISSUED" });
    expect(ownerState("SIGNED_REPORT", evaluation("ISSUED", false, "EVALUATED"))).toEqual({ state: "OPEN" });
    expect(ownerState("SIGNED_PROPOSAL_PAPER", evaluation("ISSUED", false, "EVALUATED"))).toEqual({ state: "NOT_READY", exit: "PROPOSAL_NOT_SIGNED" });
    expect(ownerState("SIGNED_PROPOSAL_PAPER", evaluation("ISSUED", true, "EVALUATED"))).toEqual({ state: "OPEN" });
    expect(EXIT_TEXT.PROPOSAL_NOT_SIGNED).toMatch(/checking and recommending/);
  });
  it("a superseded or cancelled version keeps what it has; a cancelled exercise freezes all", () => {
    expect(ownerState("SIGNED_REPORT", evaluation("SUPERSEDED"))).toEqual({ state: "FROZEN", exit: "EVALUATION_CLOSED" });
    expect(ownerState("REPORT_DRAWINGS", evaluation("CANCELLED"))).toEqual({ state: "FROZEN", exit: "EVALUATION_CLOSED" });
    expect(ownerState("REPORT_DRAWINGS", evaluation("OPEN", false, "CANCELLED"))).toEqual({ state: "FROZEN", exit: "EXERCISE_CANCELLED" });
  });
  it("links to the Evaluation tab's report", () => {
    expect(ownerHref("evaluation", "e1", "x1")).toBe("/sourcing/x1?tab=evaluation&section=report");
  });
});

describe("a meeting as an owner", () => {
  it("keeps its minutes and the confirmation until closed, then is frozen", () => {
    expect(ownerState("TENDERER_CONFIRMATION", meeting(false))).toEqual({ state: "OPEN" });
    expect(ownerState("MEETING_MINUTES", meeting(true))).toEqual({ state: "FROZEN", exit: "MEETING_CLOSED" });
    expect(ownerState("MEETING_MINUTES", meeting(false, "SUPERSEDED"))).toEqual({ state: "FROZEN", exit: "EVALUATION_CLOSED" });
    expect(ownerHref("evaluationMeeting", "m1", "x1")).toBe("/sourcing/x1?tab=evaluation&section=meetings");
  });
});

describe("a bidder as an owner", () => {
  it("stands on its CPR report once a CPR is entered: replaced by a new version, never simply taken off", () => {
    expect(reliedOn("CPR_REPORT", bidder("85.5"), 1)).toBe("CPR_ON_IT");
    expect(reliedOn("CPR_REPORT", bidder("85.5"), 2)).toBeNull();
    expect(reliedOn("CPR_REPORT", bidder(null), 1)).toBeNull();
    expect(reliedOn("COMMUNICATION", bidder("85.5"), 1)).toBeNull();
    const f = detachFault({ purpose: "CPR_REPORT", owner: bidder("85.5"), reason: "wrong file", reliedOn: "CPR_ON_IT" });
    expect(f.map((x) => x.code)).toEqual(["RELIED_ON"]);
    expect(documentFaultText(f[0])).toMatch(/performance percentage was entered from this report/);
  });
  it("is frozen once its version is no longer open", () => {
    expect(ownerState("COMMUNICATION", bidder(null, "ISSUED"))).toEqual({ state: "FROZEN", exit: "EVALUATION_CLOSED" });
  });
});
