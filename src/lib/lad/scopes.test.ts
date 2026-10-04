import { describe, expect, it } from "vitest";

import { parseSen } from "@/lib/money";

import { ladLines, lineScopeOf, type LadLinesInput, type ScopeDecision } from "./scopes";

/**
 * 6.13 Part B run 1b (FR-LAD-011; 613A-C2; BD-613-75, 89): the interim's damages lines, one per scope with a live
 * decision, by rate segment, with the credits due and the waivers applied. Pure.
 */

const R = parseSen("269.38");
const codes = (fs: readonly { code: string }[]) => fs.map((f) => f.code);
const decision = (o: Partial<ScopeDecision> = {}): ScopeDecision => ({ id: "d1", outcome: "LAD_APPLIES", reason: "", certificateIssued: true, from: "2026-09-01", until: null, rate: R, dateForCompletion: "2026-08-31", superseded: null, occupation: null, ...o });
const input = (o: Partial<LadLinesInput> = {}): LadLinesInput => ({ valuationDate: "2026-09-30", wholeDate: "2026-08-31", scopes: [{ key: "WHOLE", label: "the whole works", dateNow: "2026-08-31", decision: decision() }], issued: [], returned: [], waiversApplied: [], waiversToApply: [], ...o });

describe("one damages line per scope", () => {
  it("the whole works: 30 days at 269.38 = 8,081.40, as Part A's line", () => {
    const r = ladLines(input());
    expect(r.faults).toEqual([]);
    expect(r.lines.map((l) => [l.key, l.state, l.days, l.gross, l.amount])).toEqual([["WHOLE", "CHARGED", 30, parseSen("8081.40"), parseSen("8081.40")]]);
    expect(r.total).toEqual({ gross: parseSen("8081.40"), waived: 0n, credit: 0n, amount: parseSen("8081.40") });
  });

  it("each section with its own live decision has its own line, its own rate and accrual", () => {
    const r = ladLines(input({ scopes: [{ key: "WHOLE", label: "the whole works", dateNow: "2026-08-31", decision: decision() }, { key: "SECTION:2", label: "Section 2", dateNow: "2026-08-31", decision: decision({ id: "d2", rate: parseSen("100.00"), from: "2026-09-21" }) }] }));
    expect(r.lines.map((l) => [l.key, l.days, l.gross])).toEqual([["WHOLE", 30, parseSen("8081.40")], ["SECTION:2", 10, parseSen("1000.00")]]);
    expect(r.total.amount).toBe(parseSen("9081.40"));
  });

  it("past the whole works' date with no live decision on any scope: Part A's refusal, unchanged", () => {
    expect(codes(ladLines(input({ scopes: [{ key: "WHOLE", label: "the whole works", dateNow: "2026-08-31", decision: null }] })).faults)).toEqual(["NON_COMPLETION_DECISION_REQUIRED"]);
  });

  it("a scope's days charged before are not charged again", () => {
    const r = ladLines(input({ valuationDate: "2026-10-15", issued: [{ certificateId: "i1", number: "IP/1", scopeKey: "WHOLE", segments: [{ from: "2026-09-01", until: "2026-10-01", rate: R, days: 30 }], gross: parseSen("8081.40"), rounding: 0n }] }));
    expect(r.lines[0]).toMatchObject({ from: "2026-10-01", until: "2026-10-16", days: 15 });
  });
});

describe("supersession and the credit on the next certificate (613A-C2 as amended)", () => {
  const issued = [{ certificateId: "i1", number: "IP/1", scopeKey: "WHOLE", segments: [{ from: "2026-09-01", until: "2026-10-01", rate: R, days: 30 }], gross: parseSen("8081.40"), rounding: parseSen("-0.40") }];
  const sup = decision({ superseded: { eotNumber: "EOT/1", newDate: "2026-09-14" } });
  it("a valuation past the new date: NON_COMPLETION_SUPERSEDED until a replacement", () => {
    const r = ladLines(input({ valuationDate: "2026-10-31", scopes: [{ key: "WHOLE", label: "the whole works", dateNow: "2026-09-14", decision: sup }], issued }));
    expect(codes(r.faults)).toEqual(["NON_COMPLETION_SUPERSEDED"]);
  });
  it("on or before the new date: no replacement asked, nothing charged, the credit 3,771.32 returned", () => {
    const r = ladLines(input({ valuationDate: "2026-09-14", scopes: [{ key: "WHOLE", label: "the whole works", dateNow: "2026-09-14", decision: sup }], issued }));
    expect(r.faults).toEqual([]);
    expect(r.lines[0].state).toBe("CLOSED_BY_EXTENSION");
    expect(r.credits.map((c) => c.amount)).toEqual([parseSen("3771.32")]);
    expect(r.total).toEqual({ gross: 0n, waived: 0n, credit: parseSen("3771.32"), amount: 0n });
  });
  it("with a replacement decision from 15 Sep, the next interim charges from there and returns the credit", () => {
    const r = ladLines(input({ valuationDate: "2026-10-31", scopes: [{ key: "WHOLE", label: "the whole works", dateNow: "2026-09-14", decision: decision({ id: "d2", from: "2026-09-15", dateForCompletion: "2026-09-14" }) }], issued }));
    expect(r.faults).toEqual([]);
    expect(r.lines[0]).toMatchObject({ from: "2026-10-01", days: 31 });
    expect(r.total.credit).toBe(parseSen("3771.32"));
  });
});

describe("waivers applied on the line, and the cap", () => {
  it("applied: net = gross − waived (8,081.40 − 2,020.35 = 6,061.05)", () => {
    const r = ladLines(input({ waiversToApply: [{ id: "w1", scopeKey: "WHOLE", amount: parseSen("2020.35"), label: "CM/2" }] }));
    expect(r.lines[0]).toMatchObject({ waived: parseSen("2020.35"), amount: parseSen("6061.05"), waiverIds: ["w1"] });
  });
  it("a waiver whose application would pass the damages charged on the line refuses LAD_WAIVER_OVER_CHARGED", () => {
    expect(codes(ladLines(input({ waiversToApply: [{ id: "w1", scopeKey: "WHOLE", amount: parseSen("8081.41"), label: "CM/2" }] })).faults)).toEqual(["LAD_WAIVER_OVER_CHARGED"]);
    expect(ladLines(input({ waiversToApply: [{ id: "w1", scopeKey: "WHOLE", amount: parseSen("8081.40"), label: "CM/2" }] })).faults).toEqual([]);
  });
});

describe("lines issued before damages were kept per scope", () => {
  it("read as the scope of the only scope ever decided with damages; refused where two could own it", () => {
    expect(lineScopeOf(["WHOLE", "WHOLE"])).toEqual({ ok: true, key: "WHOLE" });
    expect(lineScopeOf(["SECTION:1"])).toEqual({ ok: true, key: "SECTION:1" });
    expect(lineScopeOf([])).toEqual({ ok: true, key: "WHOLE" });
    expect(lineScopeOf(["WHOLE", "SECTION:1"])).toEqual({ ok: false });
  });
});
