import { describe, expect, it } from "vitest";

import { eligibility, type EligibilityInput, type HeldValue } from "./eligibility";
import { BODY_WORKS, doc, TYPES } from "./fixture";
import { standing } from "./standing";

/**
 * Residual 3: the grade, categories and field codes a supplier holds were read from its newest verified
 * document by lodging day, ignoring when it is valid from. They are now read from the document in force on
 * the day judged (documentInForce). Worked example: a works certificate at grade G5 is in force; an upgrade
 * to G7, verified today (1 October 2026), is valid only from 1 November 2026. A requirement of G7 is not
 * met today; on 1 November it is.
 */

const g = (code: string, rank: number): HeldValue => ({ kind: "GRADE", code, label: `Grade ${code}`, rank });
const old = doc({ id: "w1", typeId: TYPES.works.id, issuedOn: "2025-07-01", validFrom: "2025-07-01", expiresOn: "2027-06-30" });
const upgrade = doc({ id: "w2", typeId: TYPES.works.id, supersedesId: "w1", lodgedOn: "2026-09-30", issuedOn: "2026-09-30", validFrom: "2026-11-01", expiresOn: "2028-10-31", verification: "VERIFIED", verifiedOn: "2026-10-01" });
const input = (on: string): EligibilityInput => ({
  supplier: { status: "REGISTERED" },
  standing: standing({ status: "REGISTERED" }, [], [], { autoSuspendOnLapse: null }, on),
  requirements: [{ id: "rq1", bodyCode: BODY_WORKS, bodyLabel: "Works board", qualifiers: "", alternativeGroup: 1, structured: { grade: { rank: 7, label: "Grade G7" }, categories: [] } }],
  typesOfBody: { [BODY_WORKS]: [TYPES.works.id] },
  docs: [old, upgrade],
  valuesOf: { w1: [g("G5", 5)], w2: [g("G7", 7)] },
  window: { advertisementDay: null, closingDay: null },
  policy: { expiryOnClosingDayCounts: true, restrictionEvidenceTypeId: null },
  restrictedTender: false,
  permissions: [],
  on,
});
const gradeRow = (on: string) => eligibility(input(on)).rows.find((r) => r.kind === "GRADE");

describe("the values held are the document in force's on the day (residual 3)", () => {
  it("an upgrade verified today but valid next month does not lift the grade today", () => {
    expect(gradeRow("2026-10-01")).toMatchObject({ result: "FAIL", reason: "GRADE_BELOW", data: { held: "Grade G5", needed: "Grade G7" } });
  });
  it("from its first valid day it does; the day before it does not", () => {
    expect(gradeRow("2026-10-31")).toMatchObject({ result: "FAIL", data: { held: "Grade G5" } });
    expect(gradeRow("2026-11-01")).toMatchObject({ result: "PASS", reason: "GRADE_MET", data: { held: "Grade G7" } });
  });
});
