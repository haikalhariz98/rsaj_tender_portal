import { describe, expect, it } from "vitest";

import { ALL_SCOPE_SECTIONS, scopeSectionOf, visibleScopeSections, type ScopeSectionFacts } from "./sections";

const facts = (o: Partial<ScopeSectionFacts> = {}): ScopeSectionFacts => ({ requiresBq: false, requiresCompanyEstimate: false, hasBill: false, hasEstimate: false, ...o });
const ids = (f: ScopeSectionFacts | null) => visibleScopeSections(f).map((s) => s.id);
// SR-05, SR-06, SR-07 (rulings 8, 9 and 11): five preparation sections come first, so these cases name the sections of the original three after them.
const PREP = ["details", "dates", "officers", "notice", "briefing"];

describe("the sections of Scope and estimate", () => {
  it("shows Scope alone when neither a bill nor an estimate is needed", () => {
    expect(ids(facts())).toEqual([...PREP, "scope"]);
  });
  it("adds the bill only when the basis is let on one, and the estimate only when the method asks for one", () => {
    expect(ids(facts({ requiresBq: true }))).toEqual([...PREP, "scope", "bq"]);
    expect(ids(facts({ requiresCompanyEstimate: true }))).toEqual([...PREP, "scope", "estimate"]);
    expect(ids(facts({ requiresBq: true, requiresCompanyEstimate: true }))).toEqual([...PREP, "scope", "bq", "estimate"]);
  });
  it("keeps a section whose rule is not set, so it can say what is missing", () => {
    expect(ids(facts({ requiresBq: null, requiresCompanyEstimate: null }))).toEqual([...PREP, "scope", "bq", "estimate"]);
  });
  it("keeps a section that already holds a bill or an estimate", () => {
    expect(ids(facts({ hasBill: true }))).toEqual([...PREP, "scope", "bq"]);
    expect(ids(facts({ hasEstimate: true }))).toEqual([...PREP, "scope", "estimate"]);
  });
  it("shows everything when nothing is known", () => {
    expect(ids(null)).toEqual([...PREP, "scope", "bq", "estimate"]);
    expect(ALL_SCOPE_SECTIONS.map((s) => s.label)).toEqual(["Details & compliance", "Key dates & person in charge", "Opening officers", "Notice and fee", "Briefing and site visit", "Scope", "Bill of quantities", "Company estimate"]);
  });
  it("an exercise that issues no tender documents has no dates, officers, notice or briefing to prepare, and keeps its details", () => {
    // SR-05 (ruling 8): the dates section stays with no pack, for the person in charge.
    expect(ids(facts({ tendered: false }))).toEqual(["details", "dates", "scope"]);
    expect(ids(facts({ tendered: true }))).toEqual([...PREP, "scope"]);
    expect(ids(facts({ tendered: null }))).toEqual([...PREP, "scope"]);
  });
  it("falls back to the first visible section for a hidden or unknown one, and keeps the ids deep links use", () => {
    const v = visibleScopeSections(facts({ requiresCompanyEstimate: true }));
    expect(scopeSectionOf("estimate", v)).toBe("estimate");
    expect(scopeSectionOf("bq", v)).toBe("details");
    expect(scopeSectionOf("nonsense", v)).toBe("details");
    expect(scopeSectionOf(undefined, v)).toBe("details");
    expect(scopeSectionOf("scope", v)).toBe("scope");
  });
});
