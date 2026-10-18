import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { gateDetailText } from "./gate-words";

/**
 * 6.12 (flagged against 6.11, new tests only): the gate's words moved from the award page into one place
 * both the award and the contract read, unchanged; and an award whose contract is executed is not
 * cancelled (BD-17), checked before anything is written.
 */

describe("the readiness gate's words, shared by the award and the contract", () => {
  it("insurance lists what is not lodged and what is lodged but not verified", () => {
    expect(gateDetailText({ key: "INSURANCE", detail: ["NOT_LODGED:Works insurance", "LODGED:Public liability insurance", "WC_NOT_CHECKED"] }, "")).toBe(
      "Not lodged: Works insurance. Lodged, not verified: Public liability insurance. Workmen's compensation is calculated on uncovered wages, so its sum cannot be checked: it counts as met only once the check of the declared wages is recorded, under Before signing › Securities.",
    );
  });
  it("the bond's reason is quoted", () => {
    expect(gateDetailText({ key: "BOND", detail: ["NOT_REQUIRED"] }, "Short-form terms.")).toBe("No bond required: Short-form terms.");
  });
  it("a recorded wages check says it is recorded, not judged", () => {
    expect(gateDetailText({ key: "INSURANCE", detail: ["WC_RECORDED_NOT_JUDGED"] }, "")).toMatch(/Recorded, not judged: basis not set \(D4\)\.$/);
  });
});

describe("an executed contract is not cancelled with its award", () => {
  it("cancelAward refuses before it moves anything", () => {
    const src = readFileSync(path.join(__dirname, "../../app/awards/actions.ts"), "utf8");
    const body = src.slice(src.indexOf("export async function cancelAward"), src.indexOf("// ---------------------------------------------------------------- conditions"));
    expect(body.indexOf("contractCancellable(")).toBeGreaterThan(-1);
    expect(body.indexOf("contractCancellable(")).toBeLessThan(body.indexOf("await mustMove("));
  });
});
