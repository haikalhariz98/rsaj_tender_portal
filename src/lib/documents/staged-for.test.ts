import { describe, expect, it } from "vitest";

import { STAGED_FOR_DELEGATION, STAGED_FOR_TEMPLATE_FILE, templateFileRefusal } from "./staged-for";

describe("which documents may be a configured part's template file (review S7)", () => {
  const ok = { stagedFor: STAGED_FOR_TEMPLATE_FILE, classification: "TERHAD", attachments: 0 };
  it("a document staged for the purpose, held by nothing and not SULIT, is accepted", () => {
    expect(templateFileRefusal(ok)).toBeNull();
    expect(templateFileRefusal({ ...ok, classification: "TERBUKA" })).toBeNull();
  });
  it("any other version of the organisation is refused: one with no purpose, or staged for another", () => {
    expect(templateFileRefusal({ ...ok, stagedFor: null })).toMatch(/not uploaded as a template file/);
    expect(templateFileRefusal({ ...ok, stagedFor: STAGED_FOR_DELEGATION })).toMatch(/not uploaded as a template file/);
  });
  it("a SULIT document is refused, since every officer downloads a template file", () => {
    expect(templateFileRefusal({ ...ok, classification: "SULIT" })).toMatch(/SULIT/);
  });
  it("a document a record already holds (a restricted exercise's, for one) is refused", () => {
    expect(templateFileRefusal({ ...ok, attachments: 1 })).toMatch(/already attached/);
  });
});
