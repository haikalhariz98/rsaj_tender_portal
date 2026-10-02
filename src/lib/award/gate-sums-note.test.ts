import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ReadinessGateList } from "@/components/contract/readiness-gate";

import { GATE_ITEM_NOTE, gateDetailText } from "./gate-words";

/**
 * 6.12 review S-3 (flagged against accepted 6.11, new tests): until the award's own insurance terms are
 * built (carry 64-C4-b), the gate's insurance item says that sums insured are not compared with the tender
 * Appendix's minimums or the award's terms, under the item whatever its state, on the award and the
 * contract alike. And the wages check is on the contract's Securities tab, not its Formation tab.
 */

describe("the insurance item says what it does not judge", () => {
  it("the words", () => {
    expect(GATE_ITEM_NOTE.INSURANCE).toBe("Sums insured are not yet compared with the tender Appendix's minimums or the award's own insurance terms: each policy is judged lodged and verified only.");
    expect(GATE_ITEM_NOTE.BOND).toBeUndefined();
    expect(GATE_ITEM_NOTE.RETURNED).toBeUndefined();
  });
  it("shown under a met insurance item too, once, and under no other item", () => {
    const html = renderToStaticMarkup(
      createElement(ReadinessGateList, {
        items: [
          { key: "RETURNED", state: "MET", detail: [] },
          { key: "BOND", state: "MET", detail: [] },
          { key: "INSURANCE", state: "MET", detail: [] },
        ],
        bondNotRequiredReason: "",
      }),
    );
    expect(html.split("Sums insured are not yet compared").length - 1).toBe(1);
    expect(html.indexOf("Sums insured")).toBeGreaterThan(html.indexOf("Every required policy lodged and verified"));
  });
  it("and under one not met, after its detail", () => {
    const html = renderToStaticMarkup(createElement(ReadinessGateList, { items: [{ key: "INSURANCE", state: "NOT_MET", detail: ["NOT_LODGED:Works insurance"] }], bondNotRequiredReason: "" }));
    expect(html.indexOf("Not lodged: Works insurance.")).toBeLessThan(html.indexOf("Sums insured are not yet compared"));
  });
});

describe("the wages check is recorded on the contract's Securities tab", () => {
  it("names the Securities tab, not the Formation tab", () => {
    const t = gateDetailText({ key: "INSURANCE", detail: ["WC_NOT_CHECKED"] }, "");
    expect(t).toMatch(/on the contract's Securities tab\.$/);
    expect(t).not.toMatch(/Formation tab/);
  });
});
