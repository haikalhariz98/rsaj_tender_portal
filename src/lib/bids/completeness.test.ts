import { describe, expect, it } from "vitest";

import { checklistFor, completeness, completenessConsequence, consequenceFault } from "./completeness";

const parts = [
  { partCode: "FORM", label: "Form of tender", mandatory: true, sortOrder: 2 },
  { partCode: "DECL", label: "Declaration", mandatory: true, sortOrder: 5 },
  { partCode: "AUTH", label: "Letter of authorisation", mandatory: true, sortOrder: 6 },
  { partCode: "DRAW", label: "Drawings", mandatory: false, sortOrder: 3 },
  { partCode: "OTHER", label: "Other", mandatory: null, sortOrder: 9 },
];
const addenda = [{ number: 2, title: "Revised drawings" }, { number: 1, title: "Clarification" }];

describe("the mandatory-documents checklist (FR-BID-007)", () => {
  it("is the mandatory parts in print order, then addenda 1..n; unset parts are said", () => {
    const c = checklistFor({ parts, addenda });
    expect(c.items.map((i) => i.key)).toEqual(["FORM", "DECL", "AUTH", "addendum:1", "addendum:2"]);
    expect(c.notSet).toEqual(["Other"]);
  });
  it("missing addendum 2: incomplete, naming it; a report, never a rejection", () => {
    const { items } = checklistFor({ parts, addenda });
    const r = completeness(items, new Set(["FORM", "DECL", "AUTH", "addendum:1"]));
    expect(r.complete).toBe(false);
    expect(r.missing.map((m) => m.label)).toEqual(["Addendum 2: Revised drawings"]);
    expect(completeness(items, new Set(items.map((i) => i.key))).complete).toBe(true);
  });
  it("the consequence comes from the method; null is CONSEQUENCE_NOT_SET and blocks finalising", () => {
    expect(completenessConsequence(true)).toBe("ELIMINATED");
    expect(completenessConsequence(false)).toBe("REPORTED");
    expect(completenessConsequence(null)).toBe("CONSEQUENCE_NOT_SET");
    expect(consequenceFault(null)?.code).toBe("CONSEQUENCE_NOT_SET");
    expect(consequenceFault(false)).toBeNull();
  });
});
