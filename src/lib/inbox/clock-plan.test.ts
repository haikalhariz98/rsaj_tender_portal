import { describe, expect, it } from "vitest";

import { clockPlan, clockPlanWords, CLOCK_EVENT_KEY } from "./clock-plan";

/// AC-42: the late-clock notices go to the offices the organisation's notification rule names, and to the requester.
const rule = { nameEn: "Indent expired", isActive: true, recipientRoleCodes: ["HOD", "CLERK"] };
const holders: Record<string, string[]> = { HOD: ["h2", "h1"], CLERK: [] };
const holdersOf = (c: string) => holders[c] ?? [];

describe("clockPlan", () => {
  it("tells the requester and the holders of the offices the rule names, each once, and names an office nobody holds", () => {
    const p = clockPlan({ requesterId: "r", rule, holdersOf, dayKnown: true });
    expect(p).toEqual({ state: "RULE_SET", ruleName: "Indent expired", recipientIds: ["h1", "h2", "r"], emptyOffices: ["CLERK"] });
    expect(clockPlan({ requesterId: "h1", rule, holdersOf, dayKnown: true }).recipientIds).toEqual(["h1", "h2"]);
  });
  it("tells no office when there is no rule, and says a rule that is off is a decision", () => {
    expect(clockPlan({ requesterId: "r", rule: null, holdersOf, dayKnown: true })).toMatchObject({ state: "NO_RULE", recipientIds: ["r"], emptyOffices: [] });
    expect(clockPlan({ requesterId: "r", rule: { ...rule, isActive: false }, holdersOf, dayKnown: true })).toMatchObject({ state: "RULE_OFF", recipientIds: ["r"] });
  });
  it("tells only the requester when the day is unknown, and tells no one when there is no requester and no holder", () => {
    expect(clockPlan({ requesterId: "r", rule, holdersOf, dayKnown: false })).toMatchObject({ state: "NO_TIME_ZONE", recipientIds: ["r"] });
    expect(clockPlan({ requesterId: null, rule: null, holdersOf, dayKnown: true }).recipientIds).toEqual([]);
  });
  it("keeps the two event keys apart", () => {
    expect(CLOCK_EVENT_KEY.INDENT_EXPIRED).not.toBe(CLOCK_EVENT_KEY.COMMENCEMENT_LATE);
  });
});

describe("clockPlanWords", () => {
  const name = (c: string) => `Office ${c}`;
  it("says each reading in words, names an empty office, and says the notices are not emailed", () => {
    const p = clockPlan({ requesterId: "r", rule, holdersOf, dayKnown: true });
    const w = clockPlanWords("INDENT_EXPIRED", p, name);
    expect(w).toContain("“Indent expired”");
    expect(w).toContain("Nobody holds Office CLERK today");
    expect(w).toContain("inbox only and are not emailed");
    expect(w).not.toContain("CLERK,");
    expect(clockPlanWords("COMMENCEMENT_LATE", clockPlan({ requesterId: "r", rule: null, holdersOf, dayKnown: true }), name)).toContain("No notification rule names who is to be told of a late commencement");
    expect(clockPlanWords("INDENT_EXPIRED", clockPlan({ requesterId: "r", rule: { ...rule, isActive: false }, holdersOf, dayKnown: true }), name)).toContain("switched off");
  });
  it("says a restricted exercise's notice reaches only those named on it", () => {
    const p = clockPlan({ requesterId: "r", rule, holdersOf, dayKnown: true });
    expect(clockPlanWords("INDENT_EXPIRED", p, name, { restricted: true })).toContain("This exercise is restricted: a notice reaches only those of them who are named on it.");
    expect(clockPlanWords("INDENT_EXPIRED", p, name)).not.toContain("restricted");
  });
  it("leaves a requester who is no longer active out, and says so rather than that the requester is told", () => {
    const p = clockPlan({ requesterId: "r", requesterActive: false, rule, holdersOf, dayKnown: true });
    expect(p.recipientIds).toEqual(["h1", "h2"]);
    expect(p.requesterInactive).toBe(true);
    const w = clockPlanWords("INDENT_EXPIRED", p, name);
    expect(w).toContain("The requester is no longer active and is not told.");
    expect(w).not.toContain("The requester and");
    expect(clockPlanWords("INDENT_EXPIRED", clockPlan({ requesterId: "r", requesterActive: false, rule: null, holdersOf, dayKnown: true }), name)).not.toContain("The requester is.");
    expect(clockPlan({ requesterId: "r", requesterActive: true, rule, holdersOf, dayKnown: true }).requesterInactive).toBeUndefined();
  });
});
