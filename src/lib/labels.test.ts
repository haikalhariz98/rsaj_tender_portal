import { describe, expect, it } from "vitest";

import { actLabel } from "@/components/ui/act";

import { AUTHORITY_ACTS } from "./authority/types";
import { ACT_LABEL, actWithCode, condLabel, routedOnLabel } from "./labels";

describe("an authority act reads as words with its DAL code (ruling CO-9, FR-APR-003)", () => {
  it("names every act and shows the manual's code beside it", () => {
    expect(actWithCode("MR")).toBe("Mandatory recommendation (MR)");
    expect(actWithCode("A")).toBe("Approve (A)");
    for (const code of Object.keys(ACT_LABEL)) expect(actWithCode(code)).toBe(`${ACT_LABEL[code]} (${code})`);
  });
  it("tells a mandatory recommendation from a recommendation at a glance", () => {
    expect(actLabel("MR")).not.toBe(actLabel("R"));
    expect(actLabel("R")).toBe("Recommend (R)");
  });
  it("never shows a code it does not know as if it were one", () => {
    expect(actWithCode("ZZ")).toBe("Unknown act");
  });
});

describe("what a route was chosen on (Phase 1 carry 4)", () => {
  it("names the condition when the rule has one", () => {
    expect(routedOnLabel("over_budget")).toBe(condLabel("over_budget"));
    expect(routedOnLabel("over_budget")).toBe("When over budget");
  });
  it("says the value alone when it has none, never a vague pronoun", () => {
    for (const none of [null, undefined, ""]) expect(routedOnLabel(none)).toBe("The requisition's value alone");
  });
});

describe("one act vocabulary: the grammar's list and the words agree", () => {
  it("every act in AUTHORITY_ACTS has words, and ACT_LABEL names no other", () => {
    expect([...AUTHORITY_ACTS].sort()).toEqual(Object.keys(ACT_LABEL).sort());
    for (const a of AUTHORITY_ACTS) expect(ACT_LABEL[a]).toBeTruthy();
  });
});
