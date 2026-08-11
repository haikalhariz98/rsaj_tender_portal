import type { CodeFormat, OrgUnit } from "./types";

/**
 * A small synthetic structure for testing.
 *
 * Deliberately not any real organisation's chart. These functions apply whatever
 * structure they are handed, and a fixture copied from one customer bakes that
 * customer's tiers into the tests' idea of correct. Every entry exercises one
 * behaviour: a normal tree, a unit that outlives its parent, and a loop.
 */

const unit = (u: Partial<OrgUnit> & Pick<OrgUnit, "code" | "kind">): OrgUnit => ({
  nameEn: u.code,
  nameMs: null,
  parentCode: null,
  costCentreCode: null,
  governingSource: "",
  provenance: "STATED",
  notes: "",
  sortOrder: 0,
  effectiveFrom: new Date("2020-01-01"),
  effectiveTo: null,
  ...u,
});

export const UNITS: OrgUnit[] = [
  unit({ code: "co", kind: "COMPANY", nameEn: "The company", sortOrder: 1 }),
  unit({ code: "div_a", kind: "DIVISION", nameEn: "Division A", parentCode: "co", sortOrder: 2 }),
  unit({
    code: "dept_a1",
    kind: "DEPARTMENT",
    nameEn: "Department A1",
    parentCode: "div_a",
    sortOrder: 3,
  }),
  unit({
    code: "sect_a1x",
    kind: "SECTION",
    nameEn: "Section A1X",
    parentCode: "dept_a1",
    costCentreCode: "cc-1",
    sortOrder: 4,
  }),

  /// A division that closed at the end of 2025, and a department still naming it.
  /// On a date after the closure the department is detached, not re-rooted.
  unit({
    code: "div_gone",
    kind: "DIVISION",
    nameEn: "Division since dissolved",
    parentCode: "co",
    effectiveTo: new Date("2026-01-01"),
    sortOrder: 5,
  }),
  unit({
    code: "dept_orphan",
    kind: "DEPARTMENT",
    nameEn: "Department left behind",
    parentCode: "div_gone",
    provenance: "ASSUMED",
    sortOrder: 6,
  }),

  /// Two units naming each other. A configuration mistake, and the walk must end.
  unit({ code: "loop_x", kind: "DEPARTMENT", parentCode: "loop_y", sortOrder: 7 }),
  unit({ code: "loop_y", kind: "DEPARTMENT", parentCode: "loop_x", sortOrder: 8 }),

  /// Not yet in force: a section that starts next year.
  unit({
    code: "sect_future",
    kind: "SECTION",
    parentCode: "dept_a1",
    effectiveFrom: new Date("2027-01-01"),
    sortOrder: 9,
  }),
];

export const FORMATS: CodeFormat[] = [
  {
    key: "cost_centre",
    pattern: "[A-Z]{2}-\\d{3}",
    example: "AB-123",
    description: "Two letters, a hyphen, three digits.",
    provenance: "STATED",
  },
  {
    key: "account_code",
    // Deliberately unanchored, to prove the validator anchors it.
    pattern: "\\d{4}",
    example: "1234",
    description: "Four digits.",
    provenance: "OBSERVED",
  },
  {
    key: "broken",
    pattern: "([unclosed",
    example: "",
    description: "A pattern the customer mistyped.",
    provenance: "ASSUMED",
  },
];
