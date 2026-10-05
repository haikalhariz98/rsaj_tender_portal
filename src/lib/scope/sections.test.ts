import { describe, expect, it } from "vitest";

import { ALL_SCOPE_SECTIONS, scopeSectionOf, visibleScopeSections, type ScopeSectionFacts } from "./sections";

const facts = (o: Partial<ScopeSectionFacts> = {}): ScopeSectionFacts => ({ requiresBq: false, requiresCompanyEstimate: false, hasBill: false, hasEstimate: false, ...o });
const ids = (f: ScopeSectionFacts | null) => visibleScopeSections(f).map((s) => s.id);

describe("the sections of Scope and estimate", () => {
  it("shows Scope alone when neither a bill nor an estimate is needed", () => {
    expect(ids(facts())).toEqual(["scope"]);
  });
  it("adds the bill only when the basis is let on one, and the estimate only when the method asks for one", () => {
    expect(ids(facts({ requiresBq: true }))).toEqual(["scope", "bq"]);
    expect(ids(facts({ requiresCompanyEstimate: true }))).toEqual(["scope", "estimate"]);
    expect(ids(facts({ requiresBq: true, requiresCompanyEstimate: true }))).toEqual(["scope", "bq", "estimate"]);
  });
  it("keeps a section whose rule is not set, so it can say what is missing", () => {
    expect(ids(facts({ requiresBq: null, requiresCompanyEstimate: null }))).toEqual(["scope", "bq", "estimate"]);
  });
  it("keeps a section that already holds a bill or an estimate", () => {
    expect(ids(facts({ hasBill: true }))).toEqual(["scope", "bq"]);
    expect(ids(facts({ hasEstimate: true }))).toEqual(["scope", "estimate"]);
  });
  it("shows everything when nothing is known", () => {
    expect(ids(null)).toEqual(["scope", "bq", "estimate"]);
    expect(ALL_SCOPE_SECTIONS.map((s) => s.label)).toEqual(["Scope", "Bill of quantities", "Company estimate"]);
  });
  it("falls back to the first visible section for a hidden or unknown one, and keeps the ids deep links use", () => {
    const v = visibleScopeSections(facts({ requiresCompanyEstimate: true }));
    expect(scopeSectionOf("estimate", v)).toBe("estimate");
    expect(scopeSectionOf("bq", v)).toBe("scope");
    expect(scopeSectionOf("nonsense", v)).toBe("scope");
    expect(scopeSectionOf(undefined, v)).toBe("scope");
  });
});
