import { describe, expect, it } from "vitest";

import { STAGED_FOR_DELEGATION, STAGED_FOR_PROJECT_DOCUMENT, STAGED_FOR_TEMPLATE_FILE, templateFileRefusal } from "./staged-for";

describe("which documents may be a configured part's template file (review S7)", () => {
  const ok = { stagedFor: STAGED_FOR_TEMPLATE_FILE, classification: "TERHAD", attachments: 0 };
  it("a document staged for the purpose, held by nothing and not SULIT, is accepted", () => {
    expect(templateFileRefusal(ok)).toBeNull();
    expect(templateFileRefusal({ ...ok, classification: "TERBUKA" })).toBeNull();
  });
  it("any other version of the organisation is refused: one with no purpose, or staged for another", () => {
    expect(templateFileRefusal({ ...ok, stagedFor: null })).toMatch(/not uploaded as a template file/);
    expect(templateFileRefusal({ ...ok, stagedFor: STAGED_FOR_DELEGATION })).toMatch(/not uploaded as a template file/);
    expect(templateFileRefusal({ ...ok, stagedFor: STAGED_FOR_PROJECT_DOCUMENT })).toMatch(/not uploaded as a template file/);
  });
  it("a SULIT document is refused, since every officer downloads a template file", () => {
    expect(templateFileRefusal({ ...ok, classification: "SULIT" })).toMatch(/SULIT/);
  });
  it("a document a record already holds (a restricted exercise's, for one) is refused", () => {
    expect(templateFileRefusal({ ...ok, attachments: 1 })).toMatch(/already attached/);
  });
});

describe("the purposes a file is staged for", () => {
  it("are three, and no two share a mark, so a file staged for one is never taken for another", () => {
    const marks = [STAGED_FOR_DELEGATION, STAGED_FOR_TEMPLATE_FILE, STAGED_FOR_PROJECT_DOCUMENT];
    expect(new Set(marks).size).toBe(3);
    expect(STAGED_FOR_PROJECT_DOCUMENT).toBe("project-document");
  });
});
