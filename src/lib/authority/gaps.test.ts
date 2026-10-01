import { describe, expect, it } from "vitest";

import { gapMatters, gapTitle } from "./gaps";

const rule = (ruleKey: string, domain: string, labelEn: string, isGap: boolean) => ({ ruleKey, domain, labelEn, isGap });

describe("matters with no limit set (gapMatters)", () => {
  const rules = [rule("A", "payment", "Up to RM50,000", false), rule("B", "payment", "Small instruments", true), rule("C", "appointment", "", true)];

  it("names each gap by its matter and rule label, never by its code", () => {
    const g = gapMatters(rules);
    expect(g).toHaveLength(2);
    expect(g[0].label).toContain("Small instruments");
    expect(g.map((x) => x.label).join(" ")).not.toMatch(/\b[A-Z]{3,}_[A-Z_]+\b|payment\b/);
  });

  it("leaves out rules that have a limit", () => {
    expect(gapMatters(rules).map((g) => g.ruleKey)).toEqual(["B", "C"]);
    expect(gapMatters([rules[0]])).toEqual([]);
  });

  it("titles the count in the singular and the plural", () => {
    expect(gapTitle(gapMatters(rules))).toBe("2 matters have no limit set for it");
    expect(gapTitle(gapMatters([rules[1]]))).toBe("1 matter has no limit set for it");
  });
});
