import { describe, expect, it } from "vitest";

import { openingGateFaults, type OpeningForGate, type OpeningGateFacts } from "./award-gate";

/**
 * Plan §4.9, C-7, C-8 (X-9): 6.7's gate on an award. Phase 1 exercises (no window, demo_sx10–14)
 * are asked nothing. The awardee is compared as a party; an award naming none never matches.
 */

const main = (over: Partial<OpeningForGate> = {}): OpeningForGate => ({ kind: "MAIN", sequenceNo: 1, finalised: true, liveScans: 1, copyCheck: "MATCH", explained: false, admittedEnvelopeId: null, ...over });
const facts = (over: Partial<OpeningGateFacts> = {}): OpeningGateFacts => ({ applies: true, openings: [main()], admittedEnvelopeIds: [], carriedPartyIds: new Set(["p1"]), ...over });
const codes = (g: OpeningGateFacts, awardee?: string | null) => openingGateFaults(g, awardee).map((f) => f.code);

describe("the award after the opening", () => {
  it("an exercise with no window (Phase 1) → nothing asked", () => expect(codes(facts({ applies: false, openings: [] }), null)).toEqual([]));
  it("all clear with a carried awardee", () => expect(codes(facts(), "p1")).toEqual([]));
  it("no opening, or not finalised", () => {
    expect(codes(facts({ openings: [] }))).toEqual(["OPENING_NOT_STARTED"]);
    expect(codes(facts({ openings: [main({ finalised: false })] }))).toEqual(["OPENING_NOT_FINALISED"]);
  });
  it("finalised without its signed schedule's scan → SIGNED_SCHEDULE_NOT_ATTACHED", () => expect(codes(facts({ openings: [main({ liveScans: 0 })] }))).toEqual(["SIGNED_SCHEDULE_NOT_ATTACHED"]));
  it("a copy finding unexplained holds it; explained, it does not", () => {
    expect(codes(facts({ openings: [main({ copyCheck: "MISMATCH" })] }))).toEqual(["ESTIMATE_COPY_UNEXPLAINED"]);
    expect(codes(facts({ openings: [main({ copyCheck: "MISMATCH", explained: true })] }))).toEqual([]);
  });
  it("an admitted envelope not opened at a finalised supplementary opening → ADMITTED_UNOPENED", () => {
    expect(codes(facts({ admittedEnvelopeIds: ["e4"] }))).toEqual(["ADMITTED_UNOPENED"]);
    const supp = { ...main(), kind: "SUPPLEMENTARY" as const, sequenceNo: 2, admittedEnvelopeId: "e4" };
    expect(codes(facts({ admittedEnvelopeIds: ["e4"], openings: [main(), supp] }))).toEqual([]);
    expect(codes(facts({ admittedEnvelopeIds: ["e4"], openings: [main(), { ...supp, finalised: false }] }))).toEqual(["SUPPLEMENTARY_NOT_FINALISED", "ADMITTED_UNOPENED"]);
  });
  it("the awardee among the evaluation set, compared as a party; empty never matches (C-7)", () => {
    expect(codes(facts(), "p2")).toEqual(["AWARDEE_NOT_CARRIED"]);
    expect(codes(facts(), null)).toEqual(["AWARDEE_NOT_NAMED"]);
    expect(codes(facts(), "")).toEqual(["AWARDEE_NOT_NAMED"]);
    expect(codes(facts({ carriedPartyIds: new Set() }), "p1")).toEqual(["AWARDEE_NOT_CARRIED"]);
  });
});
