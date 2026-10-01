import { describe, expect, it } from "vitest";

import { actLabel } from "@/components/ui/act";

import { ACT_LABEL, actWithCode } from "./labels";

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
