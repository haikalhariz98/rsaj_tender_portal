import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ReadinessGateList } from "@/components/contract/readiness-gate";

import { GATE_ITEM_NOTE, gateDetailText } from "./gate-words";

/**
 * 6.12 review S-3 (flagged against accepted 6.11, new tests): the gate's insurance item says what it judges,
 * under the item whatever its state, on the award and the contract alike. And the wages check is on the
 * contract's Securities tab, not its Formation tab.
 *
 * 64-C4-b (6.13 Part A step 0, as ruled: "S-3's 'not compared' sentence leaves the shared gate wording",
 * a faithful change): the award's own insurance terms are built and sums insured are compared, so the note
 * now says what governs each comparison. The placement assertions are unchanged.
 */

describe("the insurance item says what it does not judge", () => {
  it("the words", () => {
    expect(GATE_ITEM_NOTE.INSURANCE).toBe("Each required policy's sum insured is compared with the award's own figure for its kind, or the tender Appendix's minimum where the award states none.");
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
    expect(html.split("sum insured is compared").length - 1).toBe(1);
    expect(html.indexOf("sum insured is compared")).toBeGreaterThan(html.indexOf("Every required policy lodged and verified"));
  });
  it("and under one not met, after its detail", () => {
    const html = renderToStaticMarkup(createElement(ReadinessGateList, { items: [{ key: "INSURANCE", state: "NOT_MET", detail: ["NOT_LODGED:Works insurance"] }], bondNotRequiredReason: "" }));
    expect(html.indexOf("Not lodged: Works insurance.")).toBeLessThan(html.indexOf("sum insured is compared"));
  });
});

describe("the wages check is recorded on the contract's Securities tab", () => {
  it("names the Securities tab, not the Formation tab", () => {
    const t = gateDetailText({ key: "INSURANCE", detail: ["WC_NOT_CHECKED"] }, "");
    expect(t).toMatch(/on the contract's Securities tab\.$/);
    expect(t).not.toMatch(/Formation tab/);
  });
});
