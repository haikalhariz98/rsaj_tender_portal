import { describe, expect, it } from "vitest";

import { eligibility, structuredOf, type EligibilityInput, type HeldValue, type RequirementFacts } from "./eligibility";
import { BODY_WORKS, doc, TYPES } from "./fixture";
import { standing } from "./standing";

/**
 * 615-C1: structured needs reach a requirement. A requirement with needs is compared (grade by rank, categories any-of, field codes and permit types all-of); words an officer typed
 * beside them are never quietly promoted; words composed from the needs are not a second condition.
 */

const held = (kind: HeldValue["kind"], code: string, rank: number | null = null): HeldValue => ({ kind, code, label: code, rank });
const works = doc({ id: "w1", typeId: TYPES.works.id, issuedOn: "2025-07-01", validFrom: "2025-07-01", expiresOn: "2028-06-30" });
const req = (o: Partial<RequirementFacts> = {}): RequirementFacts => ({ id: "rq1", bodyCode: BODY_WORKS, bodyLabel: "Works board", qualifiers: "", alternativeGroup: 1, ...o });
const input = (requirements: RequirementFacts[], values: HeldValue[]): EligibilityInput => ({
  supplier: { status: "REGISTERED" },
  standing: standing({ status: "REGISTERED", registeredOn: null }, [], [], { autoSuspendOnLapse: null }, "2026-10-09"),
  requirements,
  typesOfBody: { [BODY_WORKS]: [TYPES.works.id] },
  docs: [works],
  valuesOf: { w1: values },
  window: { advertisementDay: "2026-10-01", closingDay: "2026-10-30" },
  policy: { expiryOnClosingDayCounts: true, restrictionEvidenceTypeId: null },
  restrictedTender: false,
  permissions: [],
  on: "2026-10-09",
});
const need = (kind: string, code: string, rankNow: number | null = null) => ({ kind, codeSnapshot: code, labelSnapshot: `${code} — name of ${code}`, rankNow });

describe("structuredOf", () => {
  it("none: the requirement is words only", () => {
    expect(structuredOf([])).toBeNull();
  });
  it("groups the needs by kind, with the grade's rank as it reads now", () => {
    expect(structuredOf([need("GRADE", "G5", 5), need("CATEGORY", "B"), need("FIELD_CODE", "12"), need("PERMIT_TYPE", "P1")])).toEqual({
      grade: { rank: 5, label: "G5 — name of G5" },
      categories: [{ code: "B", label: "B — name of B" }],
      specialisations: [],
      fieldCodes: [{ code: "12", label: "12 — name of 12" }],
      permitTypes: [{ code: "P1", label: "P1 — name of P1" }],
    });
  });
});

describe("a requirement with needs is compared", () => {
  const r = (extra: Partial<RequirementFacts> = {}) => req({ structured: structuredOf([need("GRADE", "G5", 5), need("PERMIT_TYPE", "P1"), need("PERMIT_TYPE", "P2")]), ...extra });
  it("passes when the grade is met and every permit type is held", () => {
    const e = eligibility(input([r({ qualifiersFromNeeds: true, qualifiers: "minimum grade G5" })], [held("GRADE", "G7", 7), held("PERMIT_TYPE", "P1"), held("PERMIT_TYPE", "P2")]));
    expect(e.verdict).toBe("ELIGIBLE");
    expect(e.rows.find((x) => x.kind === "PERMITS")).toMatchObject({ result: "PASS", reason: "PERMITS_HELD" });
  });
  it("fails, naming the permit type missing", () => {
    const e = eligibility(input([r()], [held("GRADE", "G7", 7), held("PERMIT_TYPE", "P1")]));
    expect(e.verdict).toBe("NOT_ELIGIBLE");
    expect(e.rows.find((x) => x.kind === "PERMITS")).toMatchObject({ result: "FAIL", reason: "PERMITS_MISSING", data: { missing: "P2 — name of P2" } });
  });
  it("reads the grade's rank as given now: a grade without a rank cannot be compared", () => {
    const e = eligibility(input([req({ structured: structuredOf([need("GRADE", "G5", null)]) })], [held("GRADE", "G7", 7)]));
    expect(e.rows.find((x) => x.kind === "GRADE")).toMatchObject({ result: "NOT_ASSESSED", reason: "GRADE_RANK_NOT_SET" });
    expect(e.verdict).toBe("NOT_ASSESSED");
  });
});

describe("words beside needs are never quietly promoted (AGENTS.md rule 2)", () => {
  const needs = structuredOf([need("GRADE", "G5", 5)]);
  const values = [held("GRADE", "G7", 7)];
  it("typed words stay 'stated in words only, not compared', so the verdict is not assessed", () => {
    const e = eligibility(input([req({ structured: needs, qualifiers: "and ten years in water works" })], values));
    expect(e.rows.find((x) => x.kind === "GRADE")).toMatchObject({ result: "PASS" });
    expect(e.rows.find((x) => x.kind === "QUALIFIERS")).toMatchObject({ result: "NOT_ASSESSED", reason: "QUALIFIERS_IN_WORDS" });
    expect(e.verdict).toBe("NOT_ASSESSED");
  });
  it("words composed from the needs are not a second condition", () => {
    const e = eligibility(input([req({ structured: needs, qualifiers: "minimum grade G5 — name of G5", qualifiersFromNeeds: true })], values));
    expect(e.rows.find((x) => x.kind === "QUALIFIERS")).toBeUndefined();
    expect(e.verdict).toBe("ELIGIBLE");
  });
  it("a requirement stated in words only is still not assessed", () => {
    const e = eligibility(input([req({ qualifiers: "grade D4" })], values));
    expect(e.rows.find((x) => x.kind === "QUALIFIERS")).toMatchObject({ result: "NOT_ASSESSED" });
    expect(e.verdict).toBe("NOT_ASSESSED");
  });
});
