import { describe, expect, it } from "vitest";

import type { CaseStepKey } from "./case-steps";
import { CASE_TABS } from "./case-tabs";
import { CASE_ACTION_AT, caseHref, keepQuery } from "./links";

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

describe("keepQuery", () => {
  it("writes back every parameter, repeated ones included, and nothing when there are none", () => {
    expect(keepQuery({})).toBe("");
    expect(keepQuery({ tab: "securities", page: "2", waiting: undefined })).toBe("?tab=securities&page=2");
    expect(keepQuery({ tab: ["a", "b"], answered: "1" })).toBe("?tab=a&tab=b&answered=1");
    expect(keepQuery({ q: "a b&c" })).toBe("?q=a+b%26c");
  });
});

describe("CASE_ACTION_AT", () => {
  it("every link-type act names a tab its stage lists", () => {
    for (const [action, at] of Object.entries(CASE_ACTION_AT)) {
      expect(CASE_TABS[at.stage as Exclude<CaseStepKey, "close-out">], action).toContain(at.tab);
    }
  });
  it("covers every act whose drawer is not in a header the bar can draw", () => {
    const linked = Object.keys(CASE_ACTION_AT).sort();
    expect(linked).toEqual(["LODGE_SECURITY", "RECORD_DESPATCH", "RECORD_POSSESSION", "RECORD_RETURN", "RECORD_SIGNATURE", "RECORD_STAMPING", "SUBMIT_TO_LEGAL", "VERIFY_SECURITY"]);
  });
});
