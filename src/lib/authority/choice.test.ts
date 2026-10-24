import { describe, expect, it } from "vitest";

import { applyChoice, choiceFaults, choicesNotMade, routeChoices } from "./choice";
import { DAL_FIXTURE } from "./dal-fixture";
import { resolveApproval, routedOffices, rulesTiedWith } from "./resolve";
import type { Matrix, Rule } from "./types";

/**
 * Route choices (decision D2, RSAJ answer 16): rows of one matter carrying an option are alternative readings, and the customer chooses. Invented
 * rows on the DAL fixture's offices, for tests only.
 */

const base: Rule = { ...DAL_FIXTURE.rules.find((r) => r.domain === "termination")!, method: null, recommenders: [], proposerCode: null, generateCoreChain: false, coreChainReason: "test" };
const row = (over: Partial<Rule>): Rule => ({ ...base, ...over });
const a1 = row({ ruleKey: "A1", choiceOptionEn: "Option A", chosen: null, contractValueMin: 15_000, contractValueMax: 300_000, approverCode: "CEO" });
const a2 = row({ ruleKey: "A2", choiceOptionEn: "Option A", chosen: null, contractValueMin: 300_000, contractValueMax: null, approverCode: "CEO" });
const b1 = row({ ruleKey: "B1", choiceOptionEn: "Option B", chosen: null, contractValueMin: 15_000, contractValueMax: 300_000, approverCode: "HODIV" });
const plain = row({ ruleKey: "OTHER", domain: "loss_expense", choiceOptionEn: null, chosen: null, approverCode: "FD" });
const rules = [a1, a2, b1, plain];
const m = (rs: Rule[]): Matrix => ({ ...DAL_FIXTURE, rules: rs });
const at = (rs: Rule[], contractValue: number) => resolveApproval(m(rs), { domain: "termination", contractValue });
const errs = (r: ReturnType<typeof at>) => r.warnings.filter((w) => w.level === "err").map((w) => w.code);

describe("a route choice", () => {
  it("is keyed by its matter, with its options in words in the rows' order", () => {
    expect(routeChoices(rules)).toEqual([{ domain: "termination", options: ["Option A", "Option B"], chosen: null }]);
    expect(choicesNotMade(rules).map((c) => c.domain)).toEqual(["termination"]);
    expect(choicesNotMade(applyChoice(rules, "termination", "Option B"))).toEqual([]);
  });

  it("not made: the matter gets no route and says so, naming the options, even where the options tie", () => {
    const r = at(rules, 200_000);
    expect([r.rule, r.approverCode, r.chain]).toEqual([null, null, []]);
    expect(errs(r)).toEqual(["CHOICE_NOT_MADE"]);
    expect(r.warnings[0].messageEn).toMatch(/“Termination \/ Arbitration”: “Option A” or “Option B”/);
    expect(r.warnings[0].messageEn).not.toMatch(/termination[^ ]|loss_expense/);
  });

  it("made: only the chosen option routes, and an option set aside never does", () => {
    const toB = applyChoice(rules, "termination", "Option B");
    expect(at(toB, 200_000)).toMatchObject({ rule: { ruleKey: "B1" }, approverCode: "HODIV" });
    expect(errs(at(toB, 200_000))).toEqual([]);
    // Option B has no row above RM300,000: that is NO_RULE, never option A's row.
    expect(at(toB, 500_000).rule).toBeNull();
    expect(errs(at(toB, 500_000))).toEqual(["NO_RULE"]);
    const toA = applyChoice(rules, "termination", "Option A");
    expect(at(toA, 500_000)).toMatchObject({ rule: { ruleKey: "A2" }, approverCode: "CEO" });
    expect(at(toA, 200_000).rule?.ruleKey).toBe("A1");
  });

  it("is no tie between two options, but rows of one option still tie", () => {
    expect(rulesTiedWith(a1, rules)).toEqual([]);
    expect(rulesTiedWith(row({ ruleKey: "A3", choiceOptionEn: "Option A", contractValueMin: 100_000, contractValueMax: 200_000 }), rules).map((r) => r.ruleKey)).toEqual(["A1"]);
    // A row that is no option still ties with an option row.
    expect(rulesTiedWith(row({ ruleKey: "PLAIN", choiceOptionEn: null, contractValueMin: 100_000, contractValueMax: 200_000 }), rules).map((r) => r.ruleKey)).toEqual(["A1", "B1"]);
  });

  it("counts no office only an option set aside routes to", () => {
    expect(routedOffices(m(rules))).toContain("HODIV");
    expect(routedOffices(m(applyChoice(rules, "termination", "Option A")))).not.toContain("HODIV");
  });
});

describe("choiceFaults", () => {
  it("passes a choice not made, and one made", () => {
    expect(choiceFaults(rules)).toEqual([]);
    expect(choiceFaults(applyChoice(rules, "termination", "Option A"))).toEqual([]);
  });

  it("refuses one option alone, an option split, two chosen and another left undecided", () => {
    expect(choiceFaults([a1, a2])).toEqual([{ fault: "ONE_OPTION", domain: "termination", option: "Option A" }]);
    expect(choiceFaults([{ ...a1, chosen: true }, a2, { ...b1, chosen: false }]).map((f) => f.fault)).toEqual(["OPTION_SPLIT"]);
    expect(choiceFaults([{ ...a1, chosen: true }, { ...a2, chosen: true }, { ...b1, chosen: true }])).toEqual([{ fault: "TWO_CHOSEN", domain: "termination", options: ["Option A", "Option B"] }]);
    expect(choiceFaults([{ ...a1, chosen: true }, { ...a2, chosen: true }, b1])).toEqual([{ fault: "OTHER_UNDECIDED", domain: "termination", option: "Option B" }]);
  });
});
