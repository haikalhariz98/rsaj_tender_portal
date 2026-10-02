import { describe, expect, it } from "vitest";

import { parseSen } from "@/lib/money";

import { bidder, facts, score, techScores } from "./fixture";
import { formatFixed } from "./fixed";
import { stageOf } from "./model";
import { liveStanding, stageResult, submitStage } from "./stages";
import { FIVE_PHASE, TA109 } from "./ta109-fixture";

/**
 * 6.8 review S-1: an open stage never shows "Passes" or a partial figure while a blocking fault
 * stands. The live view says "not yet", with the reasons; submission refuses on the same faults.
 */

const codes = (fs: { code: string }[]) => fs.map((f) => f.code);
const RM = parseSen;

describe("the live view of an open stage (S-1)", () => {
  it("missing inputs: a financial test with no factor and no balances is not judged, never 'passes'", () => {
    const f = facts({ bidders: [bidder(1), bidder(2)] }, FIVE_PHASE);
    const s = stageOf(f.model, "FASA3")!;
    const c = stageResult(f, s, f.bidders[0]);
    // The computation alone, with nothing to judge, reads as a pass: that is what the screen showed.
    expect(c.passed).toBe(true);
    const live = liveStanding(c);
    expect(live.passed).toBeNull();
    expect(live.shown).toBeNull();
    expect(live.outOfRunning).toBe(false);
    expect(codes(live.pending)).toEqual(["FACTOR_NOT_CHOSEN"]);
  });

  it("the factor chosen but a balance missing: still not judged, naming the balances", () => {
    const f = facts({ bidders: [bidder(1, { factorOptionCode: "STORE", balances: [RM("10000.00"), null, RM("10000.00")] })] }, FIVE_PHASE);
    const live = liveStanding(stageResult(f, stageOf(f.model, "FASA3")!, f.bidders[0]));
    expect(live.passed).toBeNull();
    expect(codes(live.pending)).toEqual(["BALANCES_NOT_ENTERED"]);
  });

  it("partial marks: a scored stage with one criterion unscored shows no figure built from the marks present", () => {
    const partial = new Map(techScores("80"));
    partial.delete("TECHNICAL/PROGRAMME");
    const f = facts({ bidders: [bidder(1, { scores: partial })] });
    const c = stageResult(f, stageOf(f.model, "TECHNICAL")!, f.bidders[0]);
    // The computation sums only the marks present: a partial figure, and a fail on it.
    expect(c.shown).not.toBeNull();
    expect(c.passed).toBe(false);
    const live = liveStanding(c);
    expect(live.shown).toBeNull();
    expect(live.passed).toBeNull();
    expect(live.outOfRunning).toBe(false);
    expect(codes(live.pending)).toEqual(["SCORE_MISSING"]);
  });

  it("a failed pass-or-fail criterion beside a missing one: not 'out of the running' yet", () => {
    const f = facts({ bidders: [bidder(1, { scores: new Map([["COMPLIANCE/FORM", score(false)]]) })] });
    const c = stageResult(f, stageOf(f.model, "COMPLIANCE")!, f.bidders[0]);
    expect(c.outOfRunning).toBe(true);
    const live = liveStanding(c);
    expect(live.passed).toBeNull();
    expect(live.outOfRunning).toBe(false);
    expect(codes(live.pending)).toEqual(["SCORE_MISSING"]);
  });

  it("a shortlist not recorded is 'not yet', never a fail", () => {
    const f = facts({}, FIVE_PHASE);
    const c = stageResult(f, stageOf(f.model, "FASA2")!, f.bidders[0]);
    expect(c.passed).toBe(false);
    expect(liveStanding(c)).toMatchObject({ passed: null, outOfRunning: false });
  });

  it("complete: the live view is the computation, figure and outcome as judged", () => {
    const f = facts({ bidders: [bidder(1, { scores: techScores("85.01") })] });
    const c = stageResult(f, stageOf(f.model, "TECHNICAL")!, f.bidders[0]);
    const live = liveStanding(c);
    expect(live.pending).toEqual([]);
    expect(formatFixed(live.shown!, 2)).toBe("85.01");
    expect(live.passed).toBe(true);
  });

  it("the live view and the submission agree: whatever is pending refuses the submission", () => {
    const partial = new Map(techScores("80"));
    partial.delete("TECHNICAL/STAFF");
    const f = facts({ bidders: [bidder(1, { scores: partial })], submissions: [], results: [] }, TA109);
    const s = stageOf(f.model, "TECHNICAL")!;
    const pending = liveStanding(stageResult(f, s, f.bidders[0])).pending;
    const sub = submitStage(f, s, "pi", new Map());
    for (const p of pending) expect(codes(sub.faults)).toContain(p.code);
  });
});
