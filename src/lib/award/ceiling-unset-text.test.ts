import { describe, expect, it } from "vitest";

import type { EvaluationGateFacts } from "@/lib/evaluation/award-gate";
import { evaluationFindingText } from "@/lib/evaluation/labels";
import { parseSen } from "@/lib/money";

import { evaluationFindings } from "./gate";
import { AWARD_CEILING_NOT_RECORDED, awardFindingText } from "./labels";

/**
 * Phase 2 close-out residual 2 (68-C3, flagged against accepted 6.11): on the award, an unrecorded
 * quotation ceiling reads in the award's own words. The evaluation's text names cancelling the
 * exercise from its Invitation tab, which is not the award's way on: award at the recommended price.
 */

const facts: EvaluationGateFacts = { applies: true, pinned: true, exerciseStatus: "EVALUATED", issued: { stale: false, recommendedPartyId: "p1", price: parseSen("290000.00"), period: { value: 6, unit: "MONTHS" }, ceiling: { regime: "quotation", boundary: null, operator: null } } };

describe("an unrecorded ceiling, on the award", () => {
  it("says the differing value cannot be judged and names the recommended price as the way on", () => {
    const [f] = evaluationFindings({ facts, awardeePartyId: "p1", award: { value: parseSen("295000.00"), period: { value: 6, unit: "MONTHS" }, reasons: { value: "Negotiated", period: null } } });
    expect(f.code).toBe("BOUNDARY_NOT_RECORDED");
    expect(awardFindingText(f)).toBe("Quotation ceiling not recorded. Award at the recommended price."); // wording shortened by note 0005, founder 2026-10-19; the meaning pinned is unchanged
    expect(awardFindingText(f)).toBe(AWARD_CEILING_NOT_RECORDED);
  });

  it("never the evaluation's exit (cancel the exercise from its Invitation tab)", () => {
    const f = { code: "BOUNDARY_NOT_RECORDED", level: "block" as const };
    expect(awardFindingText(f)).not.toBe(evaluationFindingText(f));
    expect(awardFindingText(f)).not.toMatch(/Invitation tab|cancel/i);
  });
});
