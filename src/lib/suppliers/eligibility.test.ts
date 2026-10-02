import { describe, expect, it } from "vitest";

import { combine, eligibility, type EligibilityInput, type HeldValue, type RequirementFacts } from "./eligibility";
import { BODY_SUPPLY, BODY_WORKS, doc, TYPES } from "./fixture";
import { standing } from "./standing";
import type { DocumentFacts } from "./types";

/**
 * Worked example (invented, fixture only). A works tender advertised 3 November 2026, closing 17
 * November 2026, asks for the works board's registration at grade G5 or above, in civil works, and is
 * restricted. Contoh Bina holds a works board certificate valid to 30 June 2027 at grade G6 in civil works,
 * and a status certificate valid to 31 December 2026: every condition passes, so it is ELIGIBLE. Had its
 * works certificate expired on 15 November, two days before the closing, it would be NOT_ELIGIBLE,
 * though valid on the day it was checked.
 */

const W = { advertisementDay: "2026-11-03", closingDay: "2026-11-17" };
const grade = (code: string, rank: number | null): HeldValue => ({ kind: "GRADE", code, label: `Grade ${code}`, rank });
const civil: HeldValue = { kind: "CATEGORY", code: "CIV", label: "Civil works", rank: null };

const worksCert = (o: Partial<DocumentFacts> = {}) => doc({ id: "w1", typeId: TYPES.works.id, issuedOn: "2025-07-01", expiresOn: "2027-06-30", ...o });
const statusCert = doc({ id: "st1", typeId: TYPES.restriction.id, issuedOn: "2026-01-01", expiresOn: "2026-12-31" });
const req = (o: Partial<RequirementFacts> = {}): RequirementFacts => ({ id: "rq1", bodyCode: BODY_WORKS, bodyLabel: "Works board", qualifiers: "", alternativeGroup: 1, structured: { grade: { rank: 5, label: "Grade G5" }, categories: [{ code: "CIV", label: "Civil works" }] }, ...o });

const base = (o: Partial<EligibilityInput> = {}): EligibilityInput => ({
  supplier: { status: "REGISTERED" },
  standing: standing({ status: "REGISTERED" }, [], [], { autoSuspendOnLapse: null }, "2026-10-01"),
  requirements: [req()],
  typesOfBody: { [BODY_WORKS]: [TYPES.works.id], [BODY_SUPPLY]: [TYPES.supply.id] },
  docs: [worksCert(), statusCert],
  valuesOf: { w1: [grade("G6", 6), civil] },
  window: W,
  policy: { expiryOnClosingDayCounts: true, restrictionEvidenceTypeId: TYPES.restriction.id },
  restrictedTender: true,
  permissions: [],
  ...o,
});
const row = (e: ReturnType<typeof eligibility>, kind: string) => e.rows.find((r) => r.kind === kind);

describe("eligibility, condition by condition (FR-VND-011, FR-ADV-010)", () => {
  it("worked example: every condition passes, so the supplier is ELIGIBLE", () => {
    const e = eligibility(base());
    expect(e.verdict).toBe("ELIGIBLE");
    expect(e.rows.map((r) => [r.kind, r.result])).toEqual([
      ["REGISTERED", "PASS"],
      ["STANDING", "PASS"],
      ["REGISTRATION", "PASS"],
      ["GRADE", "PASS"],
      ["CATEGORY", "PASS"],
      ["RESTRICTION", "PASS"],
    ]);
  });

  it("worked example, continued: the works certificate expiring 15 November, before the 17 November closing, fails though valid today", () => {
    const e = eligibility(base({ docs: [worksCert({ expiresOn: "2026-11-15" }), statusCert] }));
    expect(e.verdict).toBe("NOT_ELIGIBLE");
    expect(row(e, "REGISTRATION")).toMatchObject({ result: "FAIL", reason: "LAPSES_BEFORE_CLOSING", data: { expiresOn: "2026-11-15" } });
  });

  describe("grade by the body's configured rank", () => {
    it("holds rank 4, needs 5: FAIL naming both", () => {
      const e = eligibility(base({ valuesOf: { w1: [grade("G4", 4), civil] } }));
      expect(row(e, "GRADE")).toMatchObject({ result: "FAIL", reason: "GRADE_BELOW", data: { needed: "Grade G5", held: "Grade G4" } });
      expect(e.verdict).toBe("NOT_ELIGIBLE");
    });
    it("holds rank 6 (or exactly 5): PASS", () => {
      expect(row(eligibility(base()), "GRADE")?.result).toBe("PASS");
      expect(row(eligibility(base({ valuesOf: { w1: [grade("G5", 5), civil] } })), "GRADE")?.result).toBe("PASS");
    });
    it("a held grade without a rank, or a needed grade without one, is NOT_ASSESSED", () => {
      expect(row(eligibility(base({ valuesOf: { w1: [grade("GX", null), civil] } })), "GRADE")).toMatchObject({ result: "NOT_ASSESSED", reason: "GRADE_RANK_NOT_SET" });
      expect(row(eligibility(base({ requirements: [req({ structured: { grade: { rank: null, label: "Grade G5" } } })] })), "GRADE")?.result).toBe("NOT_ASSESSED");
    });
    it("no grade held fails", () => {
      expect(row(eligibility(base({ valuesOf: { w1: [civil] } })), "GRADE")).toMatchObject({ result: "FAIL", reason: "GRADE_NOT_HELD" });
    });
  });

  it("categories and specialisations any-of; field codes all-of", () => {
    const supply = doc({ id: "s1", typeId: TYPES.supply.id, issuedOn: "2026-01-01", expiresOn: "2027-12-31" });
    const fc = (code: string): HeldValue => ({ kind: "FIELD_CODE", code, label: `Field ${code}`, rank: null });
    const supplyReq = req({ id: "rq2", bodyCode: BODY_SUPPLY, bodyLabel: "Supplier register", structured: { fieldCodes: [{ code: "F1", label: "Field F1" }, { code: "F2", label: "Field F2" }] } });
    const one = eligibility(base({ requirements: [supplyReq], docs: [supply, statusCert], valuesOf: { s1: [fc("F1")] } }));
    expect(row(one, "FIELD_CODES")).toMatchObject({ result: "FAIL", reason: "FIELD_CODES_MISSING", data: { missing: "Field F2" } });
    const both = eligibility(base({ requirements: [supplyReq], docs: [supply, statusCert], valuesOf: { s1: [fc("F1"), fc("F2")] } }));
    expect(row(both, "FIELD_CODES")?.result).toBe("PASS");
    const anyOf = eligibility(base({ requirements: [req({ structured: { categories: [{ code: "MEC", label: "Mechanical" }, { code: "CIV", label: "Civil works" }] } })] }));
    expect(row(anyOf, "CATEGORY")).toMatchObject({ result: "PASS", data: { held: "Civil works" } });
    const none = eligibility(base({ requirements: [req({ structured: { specialisations: [{ code: "S9", label: "Tunnelling" }] } })] }));
    expect(row(none, "SPECIALISATION")).toMatchObject({ result: "FAIL", reason: "VALUE_NOT_HELD" });
  });

  it("qualifiers stated in words only (as 6.4 builds them) are NOT_ASSESSED, never passed", () => {
    const e = eligibility(base({ requirements: [req({ structured: null, qualifiers: "grade G5, civil works" })] }));
    expect(row(e, "QUALIFIERS")).toMatchObject({ result: "NOT_ASSESSED", reason: "QUALIFIERS_IN_WORDS", data: { qualifiers: "grade G5, civil works" } });
    expect(e.verdict).toBe("NOT_ASSESSED");
  });

  it("one NOT_ASSESSED with no FAIL is never ELIGIBLE; any FAIL is NOT_ELIGIBLE", () => {
    expect(eligibility(base({ policy: { expiryOnClosingDayCounts: true, restrictionEvidenceTypeId: null } })).verdict).toBe("NOT_ASSESSED");
    expect(eligibility(base({ supplier: { status: "APPLICANT" } })).verdict).toBe("NOT_ELIGIBLE");
    expect(combine(["PASS", "NOT_ASSESSED"])).toBe("NOT_ASSESSED");
    expect(combine(["PASS_BY_PERMISSION", "PASS"])).toBe("PASS");
    expect(combine(["NOT_ASSESSED", "FAIL"])).toBe("FAIL");
  });

  it("suspended or blacklisted fails; a lapse with its rule unset is not assessed", () => {
    const suspended = standing({ status: "REGISTERED" }, [{ id: "s", kind: "SUSPEND", effectiveOn: "2026-09-01", endsOn: null, offenceNo: null, reasonLabel: "x", reinstatesEventId: null, liftsEventId: null, flaggedDocumentIds: [] }], [], { autoSuspendOnLapse: null }, "2026-10-01");
    expect(row(eligibility(base({ standing: suspended })), "STANDING")).toMatchObject({ result: "FAIL", reason: "BARRED", data: { standing: "SUSPENDED" } });
    const lapsed = standing({ status: "REGISTERED" }, [], [{ typeLabel: "Tax clearance", state: "EXPIRED" }], { autoSuspendOnLapse: null }, "2026-10-01");
    expect(row(eligibility(base({ standing: lapsed })), "STANDING")).toMatchObject({ result: "NOT_ASSESSED", reason: "LAPSE_RULE_NOT_SET" });
  });

  it("the restriction: not stated is not assessed; evidence type not set is not assessed; evidence lapsing before closing fails; not restricted asks nothing", () => {
    expect(row(eligibility(base({ restrictedTender: null })), "RESTRICTION")).toMatchObject({ result: "NOT_ASSESSED", reason: "RESTRICTION_NOT_STATED" });
    expect(row(eligibility(base({ policy: { expiryOnClosingDayCounts: true, restrictionEvidenceTypeId: null } })), "RESTRICTION")).toMatchObject({ result: "NOT_ASSESSED", reason: "EVIDENCE_TYPE_NOT_SET" });
    const early = doc({ id: "st1", typeId: TYPES.restriction.id, issuedOn: "2026-01-01", expiresOn: "2026-11-10" });
    expect(row(eligibility(base({ docs: [worksCert(), early] })), "RESTRICTION")).toMatchObject({ result: "FAIL", reason: "LAPSES_BEFORE_CLOSING" });
    expect(row(eligibility(base({ restrictedTender: false })), "RESTRICTION")).toBeUndefined();
  });

  it("a body with no document type tied to it is not assessed", () => {
    expect(row(eligibility(base({ typesOfBody: {} })), "REGISTRATION")).toMatchObject({ result: "NOT_ASSESSED", reason: "NO_DOCUMENT_TYPE_FOR_BODY" });
  });

  it("alternative groups: any one requirement in a group, every group", () => {
    const supplyReq = req({ id: "rq2", bodyCode: BODY_SUPPLY, bodyLabel: "Supplier register", structured: null });
    // Same group: the works requirement passes, the supply one (nothing held) fails: the group passes.
    expect(eligibility(base({ requirements: [req(), { ...supplyReq, alternativeGroup: 1 }] })).verdict).toBe("ELIGIBLE");
    // Different groups: both are required.
    expect(eligibility(base({ requirements: [req(), { ...supplyReq, alternativeGroup: 2 }] })).verdict).toBe("NOT_ELIGIBLE");
  });

  it("a special permission turns only its own grade or field-code FAIL into PASS_BY_PERMISSION", () => {
    const low = { w1: [grade("G4", 4), civil] };
    const granted = eligibility(base({ valuesOf: low, permissions: [{ requirementId: "rq1", relaxes: "GRADE" }] }));
    expect(row(granted, "GRADE")?.result).toBe("PASS_BY_PERMISSION");
    expect(granted.verdict).toBe("ELIGIBLE");
    // Another requirement's permission, or a field-code permission, does not touch this grade.
    expect(row(eligibility(base({ valuesOf: low, permissions: [{ requirementId: "rq9", relaxes: "GRADE" }] })), "GRADE")?.result).toBe("FAIL");
    expect(row(eligibility(base({ valuesOf: low, permissions: [{ requirementId: "rq1", relaxes: "FIELD_CODE" }] })), "GRADE")?.result).toBe("FAIL");
    // A category is never relaxed.
    expect(row(eligibility(base({ valuesOf: { w1: [grade("G6", 6)] }, permissions: [{ requirementId: "rq1", relaxes: "GRADE" }] })), "CATEGORY")?.result).toBe("FAIL");
  });

  it("a window not yet published is not assessed, so not eligible", () => {
    expect(eligibility(base({ window: { advertisementDay: null, closingDay: null } })).verdict).toBe("NOT_ASSESSED");
  });
});
