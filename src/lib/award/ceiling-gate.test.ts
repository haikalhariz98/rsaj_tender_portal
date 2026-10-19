import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { awardCeilingFault, type EvaluationGateFacts } from "@/lib/evaluation/award-gate";
import { parseSen } from "@/lib/money";

import { evaluationFindings } from "./gate";
import { awardFindingText } from "./labels";

/**
 * Phase 2 close-out 68-C3 (6.8 Q1's rule carried to the award gate, flagged against accepted 6.11):
 * an awarded value that differs from the recommendation is judged against the exercise's frozen
 * quotation ceiling with the same rule the recommendation and the report use (`ceilingExclusion`).
 *
 * Worked example (a finance officer can check it by hand): a quotation whose ceiling is RM 300,000.00.
 * The recommendation is RM 290,000.00. An award at RM 300,000.00 differs from it: with the ceiling
 * recorded as GT (a value exactly on the boundary is still a quotation) it stands; recorded as GTE
 * (a value on the boundary is a tender) it is refused. At RM 300,000.01, one sen above, it is refused
 * either way. A tender has no ceiling here; a quotation whose boundary was never recorded blocks.
 */

const CEILING = parseSen("300000.00");
const quotation = (operator: "GT" | "GTE" | null, boundary: bigint | null = CEILING) => ({ regime: "quotation", boundary, operator });
const issued = (ceiling: ReturnType<typeof quotation> | { regime: string; boundary: null; operator: null } | undefined) => ({ stale: false, recommendedPartyId: "p1", price: parseSen("290000.00"), period: { value: 6, unit: "MONTHS" as const }, ...(ceiling ? { ceiling } : {}) });
const facts = (i: ReturnType<typeof issued>): EvaluationGateFacts => ({ applies: true, pinned: true, exerciseStatus: "EVALUATED", issued: i });
const reasons = { value: "Negotiated at the Board", period: null };
const at = (value: string) => ({ value: parseSen(value), period: { value: 6, unit: "MONTHS" as const }, reasons });
const codes = (i: ReturnType<typeof issued>, value: string) => evaluationFindings({ facts: facts(i), awardeePartyId: "p1", award: at(value) }).map((f) => f.code);

describe("an awarded value differing from the recommendation, against the quotation ceiling (68-C3)", () => {
  it("GT: exactly on the boundary is still a quotation and stands; one sen above is refused", () => {
    expect(codes(issued(quotation("GT")), "300000.00")).toEqual([]);
    expect(codes(issued(quotation("GT")), "300000.01")).toEqual(["VALUE_ABOVE_CEILING"]);
  });

  it("GTE: exactly on the boundary is a tender and is refused; one sen below stands", () => {
    expect(codes(issued(quotation("GTE")), "300000.00")).toEqual(["VALUE_ABOVE_CEILING"]);
    expect(codes(issued(quotation("GTE")), "299999.99")).toEqual([]);
    expect(codes(issued(quotation("GTE")), "300000.01")).toEqual(["VALUE_ABOVE_CEILING"]);
  });

  it("a tender has no ceiling here, at any value", () => {
    const tender = { regime: "tender", boundary: null, operator: null };
    expect(codes(issued(tender), "9000000.00")).toEqual([]);
  });

  it("a quotation whose boundary was never recorded cannot be judged: it blocks", () => {
    expect(codes(issued(quotation(null, null)), "295000.00")).toEqual(["BOUNDARY_NOT_RECORDED"]);
    expect(codes(issued(quotation("GT", null)), "295000.00")).toEqual(["BOUNDARY_NOT_RECORDED"]);
  });

  it("a value equal to the recommendation is not asked again (it was judged when formed, 6.8 Q1)", () => {
    expect(codes(issued(quotation(null, null)), "290000.00")).toEqual([]);
    expect(awardCeilingFault({ value: parseSen("290000.00") }, { price: parseSen("290000.00"), ceiling: quotation("GTE", parseSen("100.00")) })).toBeNull();
  });

  it("the ceiling not read: nothing asked (older fixtures); the reason for the difference is still asked", () => {
    expect(codes(issued(undefined), "900000.00")).toEqual([]);
    expect(evaluationFindings({ facts: facts(issued(quotation("GT"))), awardeePartyId: "p1", award: { ...at("300000.01"), reasons: { value: null, period: null } } }).map((f) => f.code)).toEqual(["VALUE_DIFFERS_REASON_REQUIRED", "VALUE_ABOVE_CEILING"]);
  });

  it("the refusal names the ceiling and which side an exact value falls, in words, never a code", () => {
    const [gt] = evaluationFindings({ facts: facts(issued(quotation("GT"))), awardeePartyId: "p1", award: at("300000.01") });
    // 0005, founder 2026-10-19: the refusal is shortened; it still names the ceiling and which side an exact value falls.
    expect(awardFindingText(gt)).toBe("Value above the quotation ceiling of RM300,000 (exactly on it is a quotation). Award at the recommended price or within the ceiling.");
    const [gte] = evaluationFindings({ facts: facts(issued(quotation("GTE"))), awardeePartyId: "p1", award: at("300000.00") });
    expect(awardFindingText(gte)).toMatch(/exactly on it is a tender/);
    expect(awardFindingText({ code: "BOUNDARY_NOT_RECORDED", level: "block" })).toMatch(/not recorded/); // wording shortened by note 0005, founder 2026-10-19; the meaning pinned is unchanged
    for (const f of [gt, gte]) expect(awardFindingText(f)).not.toMatch(/[A-Z]{3,}_[A-Z]/);
  });

  it("the one producer reads the frozen ceiling, and the award form maps the refusal to the value (source scan)", () => {
    const read = readFileSync(join(process.cwd(), "src/lib/evaluation/gate-read.ts"), "utf8");
    expect(read).toMatch(/regime: true, boundaryValue: true, boundaryOperator: true/);
    expect(read).toMatch(/ceiling: ceilingOf\(ex\) \}/);
    const act = readFileSync(join(process.cwd(), "src/app/awards/actions.ts"), "utf8");
    expect(act).toMatch(/VALUE_ABOVE_CEILING: "awardedValue"/);
    expect(act).toMatch(/BOUNDARY_NOT_RECORDED: "awardedValue"/);
  });
});
