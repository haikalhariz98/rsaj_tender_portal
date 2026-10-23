import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { RuleInfo, ruleInfoText } from "./rule-info";

// SP-18: the popover at a decision point says the rule and its clause, and flags a rule that is not written down.
describe("RuleInfo", () => {
  it("a written rule adds nothing to the rule and its clause", () => {
    expect(ruleInfoText({ rule: "Over RM 500,000 goes to the Tender Board.", clause: "SK002 7.4.2(g)", source: "STATED" })).toBe("Over RM 500,000 goes to the Tender Board. Clause: SK002 7.4.2(g).");
  });
  it("flags usual practice and an assumption", () => {
    expect(ruleInfoText({ rule: "A rule.", source: "OBSERVED" })).toBe("A rule. Usual practice, not a written rule.");
    expect(ruleInfoText({ rule: "A rule.", source: "ASSUMED" })).toBe("A rule. Assumed, not from a written rule.");
  });
  it("is a button with the text in the page for a screen reader", () => {
    const out = renderToStaticMarkup(createElement(RuleInfo, { rule: "A rule.", source: "ASSUMED" }));
    expect(out).toContain("<button");
    expect(out).toContain('<span class="sr-only">A rule. Assumed, not from a written rule.</span>');
  });
});
