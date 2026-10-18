import { describe, expect, it } from "vitest";

import { caseHref } from "./links";

const award = { awardId: "awd_1", contractId: null };
const contract = { awardId: "awd_1", contractId: "con_9" };

describe("caseHref (AC-23)", () => {
  it("keyed by the award until a contract exists, then by the contract", () => {
    expect(caseHref(award)).toBe("/projects/awd_1");
    expect(caseHref(contract)).toBe("/projects/con_9");
  });
  it("no parameters: no ?", () => {
    expect(caseHref(contract, {})).toBe("/projects/con_9");
  });
  it("empty parameters are left out", () => {
    expect(caseHref(contract, { stage: undefined, tab: "", section: "" })).toBe("/projects/con_9");
    expect(caseHref(contract, { tab: "history", section: "" })).toBe("/projects/con_9?tab=history");
  });
  it("in the order stage, tab, section, whatever order they are given in", () => {
    expect(caseHref(contract, { section: "drawings", tab: "submissions", stage: "project" })).toBe("/projects/con_9?stage=project&tab=submissions&section=drawings");
  });
  it("values are encoded", () => {
    expect(caseHref(award, { stage: "award", tab: "a&b=c", section: "x y" })).toBe("/projects/awd_1?stage=award&tab=a%26b%3Dc&section=x+y");
    expect(caseHref({ awardId: "a/b", contractId: null })).toBe("/projects/a%2Fb");
  });
});
