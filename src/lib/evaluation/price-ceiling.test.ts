import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseSen } from "@/lib/money";

import { recommendedCeilingFault, roundCeilingWarning, type CeilingSnapshot } from "./ceiling";
import { bidder, facts, result, submission } from "./fixture";
import { parseFixed } from "./fixed";
import { evaluationFindingText } from "./labels";
import { closeMeetingFaults } from "./meetings";
import { recommendationFaults } from "./recommend";
import { reportFaults } from "./report";

/**
 * 6.8 Q1 (ruled; FR-EVL-016, FR-EVL-019, E-9): a negotiated price above the quotation's ceiling. The
 * round still closes (its minutes and price are facts) with a warning; the recommendation and the
 * report judge the price recommended at against the exercise's frozen boundary and operator with the
 * exclusion's own rule (PRICE_ABOVE_CEILING), and refuse where the boundary was never recorded
 * (BOUNDARY_NOT_RECORDED). The bid is not excluded. A tender has no ceiling here.
 *
 * Worked example, for a finance reader: the quotation ceiling is RM 500,000.00.
 *   - GT ("a price on the ceiling is still a quotation"): RM 500,000.00 may be recommended; RM 500,000.01 may not.
 *   - GTE ("a price on the ceiling is a tender"): RM 499,999.99 may be recommended; RM 500,000.00 may not.
 */

const RM = parseSen;
const codes = (fs: { code: string; level?: string }[]) => fs.filter((f) => f.level !== "warn").map((f) => f.code);
const warns = (fs: { code: string; level?: string }[]) => fs.filter((f) => f.level === "warn").map((f) => f.code);
const quotation = (operator: "GT" | "GTE" | null, boundary: string | null = "500000.00"): CeilingSnapshot => ({ regime: "quotation", boundary: boundary == null ? null : RM(boundary), operator });
const tender: CeilingSnapshot = { regime: "tender", boundary: null, operator: null };

describe("the price recommended at against the ceiling (Q1)", () => {
  it("GT: exactly on the ceiling may be recommended; one sen above may not", () => {
    expect(recommendedCeilingFault(RM("500000.00"), quotation("GT"))).toBeNull();
    const f = recommendedCeilingFault(RM("500000.01"), quotation("GT"))!;
    expect(f.code).toBe("PRICE_ABOVE_CEILING");
    expect(evaluationFindingText(f)).toBe("The price this bid would be recommended at is above this quotation's ceiling of RM500,000 (a price exactly on it is still a quotation): this bid cannot be recommended on that price.");
  });
  it("GTE: one sen below may be recommended; exactly on the ceiling may not", () => {
    expect(recommendedCeilingFault(RM("499999.99"), quotation("GTE"))).toBeNull();
    const f = recommendedCeilingFault(RM("500000.00"), quotation("GTE"))!;
    expect(f.code).toBe("PRICE_ABOVE_CEILING");
    expect(evaluationFindingText(f)).toContain("(a price exactly on it is a tender)");
  });
  it("a tender is never judged against a ceiling", () => {
    expect(recommendedCeilingFault(RM("99999999.99"), tender)).toBeNull();
  });
  it("a quotation whose boundary or operator was never recorded: BOUNDARY_NOT_RECORDED blocks", () => {
    expect(recommendedCeilingFault(RM("1.00"), quotation("GT", null))?.code).toBe("BOUNDARY_NOT_RECORDED");
    expect(recommendedCeilingFault(RM("1.00"), quotation(null))?.code).toBe("BOUNDARY_NOT_RECORDED");
  });
  it("the finding carries the boundary, never the bid's price", () => {
    const f = recommendedCeilingFault(RM("612450.30"), quotation("GT"))!;
    expect(JSON.stringify(f)).not.toContain("612");
  });
});

describe("closing a negotiation round (Q1)", () => {
  const c = { kind: "NEGOTIATION" as const, closed: false, minutes: "m", liveConfirmations: 1, personActive: true };
  it("a round above the ceiling closes, with the warning", () => {
    const fs = closeMeetingFaults({ ...c, priceBefore: RM("480000.00"), priceAfter: RM("500000.01"), ceiling: quotation("GT") });
    expect(codes(fs)).toEqual([]);
    expect(warns(fs)).toEqual(["PRICE_RAISED", "PRICE_ABOVE_CEILING_AT_ROUND"]);
    expect(evaluationFindingText(fs[1])).toContain("above this quotation's ceiling of RM500,000");
    expect(evaluationFindingText(fs[1])).toContain("this bid cannot be recommended on this price");
  });
  it("a raise that stays under the ceiling: the PRICE_RAISED warning only", () => {
    expect(warns(closeMeetingFaults({ ...c, priceBefore: RM("480000.00"), priceAfter: RM("490000.00"), ceiling: quotation("GT") }))).toEqual(["PRICE_RAISED"]);
  });
  it("a tender's round, or a quotation with no boundary recorded: no ceiling warning at the round (the recommendation judges)", () => {
    expect(closeMeetingFaults({ ...c, priceBefore: RM("1.00"), priceAfter: RM("1.00"), ceiling: tender })).toEqual([]);
    expect(closeMeetingFaults({ ...c, priceBefore: RM("1.00"), priceAfter: RM("1.00"), ceiling: quotation("GT", null) })).toEqual([]);
    expect(roundCeilingWarning(RM("1.00"), quotation("GT", null))).toBeNull();
  });
});

describe("the recommendation and the report refuse a price above the ceiling (Q1)", () => {
  const all = ["COMPLIANCE", "ASPECTS", "TECHNICAL", "FINANCIAL", "COMPOSITE"];
  const ok = { verdict: "SATISFACTORY" as const, narrative: "x" };
  const f = (negotiatedPrice: bigint | null) =>
    facts({
      submissions: all.map((s) => submission(s)),
      results: [result("b1", "COMPOSITE", { shown: parseFixed("85.01") }), result("b2", "COMPOSITE", { shown: parseFixed("80.00") })],
      bidders: [bidder(1, { priceAsRead: RM("480000.00"), negotiatedPrice, aspects: new Map([["B", ok]]) }), bidder(2, { aspects: new Map([["B", ok]]) })],
    });
  const rec = (x: ReturnType<typeof f>, ceiling: CeilingSnapshot) => recommendationFaults(x, { bidderId: "b1", justification: "", personActive: true, alreadyFormed: false, meetingsOpen: 0, negotiationsPending: 0, ceiling });
  it("negotiated above the ceiling: not formed on that price; the bid stays in the running and ranked", () => {
    expect(codes(rec(f(RM("500000.01")), quotation("GT")).faults)).toEqual(["PRICE_ABOVE_CEILING"]);
    expect(rec(f(RM("500000.01")), quotation("GT")).topRanked).toBe(true);
  });
  it("as read within, negotiated within: formed", () => {
    expect(rec(f(null), quotation("GT")).faults).toEqual([]);
    expect(rec(f(RM("500000.00")), quotation("GT")).faults).toEqual([]);
  });
  it("a boundary never recorded: not formed", () => {
    expect(codes(rec(f(null), quotation("GT", null)).faults)).toEqual(["BOUNDARY_NOT_RECORDED"]);
  });
  it("a tender: never judged", () => {
    expect(rec(f(RM("99999999.00")), tender).faults).toEqual([]);
  });
  it("the report refuses on the recorded price the same way", () => {
    const base = { stagesIncomplete: [], recommended: true, openMeetings: 0, pendingNegotiations: 0, seriesKey: "k", template: { state: "OK" as const, missing: [], unknown: [] }, admittedUnopened: 0, supplementaryInProgress: false, consent: [], stale: false, personActive: true, today: "2026-10-02" };
    expect(codes(reportFaults({ ...base, ceiling: { price: RM("500000.00"), snapshot: quotation("GTE") } }))).toEqual(["PRICE_ABOVE_CEILING"]);
    expect(reportFaults({ ...base, ceiling: { price: RM("500000.00"), snapshot: quotation("GT") } })).toEqual([]);
    expect(codes(reportFaults({ ...base, ceiling: { price: RM("1.00"), snapshot: quotation(null) } }))).toEqual(["BOUNDARY_NOT_RECORDED"]);
  });
});

describe("every producer states the ceiling (source scan; the inputs are optional only for earlier fixtures)", () => {
  const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");
  it("the actions, the tab and the demo", () => {
    const report = read("src", "app", "sourcing", "[id]", "evaluation", "report-actions.ts");
    expect(report).toMatch(/negotiationsPending: [^\n]*, ceiling: ceilingOf\(l\.ex\) \}\);/);
    expect(report).toMatch(/ceiling: rec \? \{ price: senFromDecimal\(rec\.price\), snapshot: ceilingOf\(l\.ex\) \} : null,/);
    const meeting = read("src", "app", "sourcing", "[id]", "evaluation", "meeting-actions.ts");
    expect(meeting).toMatch(/personActive: !!person, ceiling: ceilingOf\(l\.ex\) \}\);/);
    const tab = read("src", "lib", "evaluation", "read.ts");
    expect(tab).toMatch(/ceiling: rec \? \{ price: senFromDecimal\(rec\.price\), snapshot: ceiling \} : null,/);
    const demo = read("prisma", "demo-evaluation.ts");
    expect(demo.match(/ceiling: ceilingOf\(l\.ex\)/g)?.length).toBeGreaterThanOrEqual(2);
    expect(demo).toMatch(/ceiling: \{ price: senFromDecimal\(rec\.price\), snapshot: ceilingOf\(l\.ex\) \}/);
  });
});
