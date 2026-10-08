import { beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { eligibilityOf } from "@/lib/suppliers/standing-repo";
import { makePerson, makeSupplierAccount, randomId, testOrganisation } from "@/lib/test-db/auth-fixtures";

import { needFaults } from "./requirement-needs";
import { createRequirement, deleteRequirement, loadNeedValues } from "./requirement-store";

/**
 * 615-C1 against a real database: needs are written with their requirement and deleted with it; the database itself refuses two grades and an unknown kind; and eligibility reads the
 * needs, the grade's rank as it reads NOW (so a rank corrected after the requirement was written is the one compared).
 */

const D = (day: string) => new Date(`${day}T00:00:00.000Z`);

let organisationId: string;
let exerciseId: string;
let bodyCode: string;
let typeId: string;
let g5: string;
let g7: string;
let catB: string;
let fieldA: string;
let supplierId: string;
let accountId: string;

beforeAll(async () => {
  organisationId = (await testOrganisation()).id;
  const tag = randomId();
  bodyCode = `c1_board_${tag}`;
  const body = await db.registrationBody.create({ data: { organisationId, code: bodyCode, labelEn: "the works board", qualifierLabelEn: "grade and category", provenance: "ASSUMED" } });
  const value = (code: string, kind: "GRADE" | "CATEGORY" | "FIELD_CODE", nameEn: string, rank: number | null) =>
    db.registrationValue.create({ data: { organisationId, bodyId: body.id, kind, code, nameEn, rank, provenance: "ASSUMED" } });
  g5 = (await value("G5", "GRADE", "Grade five", 5)).id;
  g7 = (await value("G7", "GRADE", "Grade seven", 7)).id;
  catB = (await value("B", "CATEGORY", "Buildings", null)).id;
  fieldA = (await value("12", "FIELD_CODE", "Water", null)).id;
  typeId = (await db.supplierDocumentType.create({ data: { organisationId, code: `c1_type_${tag}`, nameEn: "Board certificate", bodyId: body.id, valueKinds: ["GRADE", "CATEGORY", "FIELD_CODE"], expires: true, mandatoryAtRegistration: true, notApplicableAllowed: false, provenance: "ASSUMED" } })).id;
  const person = await makePerson(organisationId);
  const requisition = await db.requisition.create({
    data: {
      organisationId, reference: `C1/REQ/${tag}`, requestingUnitCode: "C1_UNIT", requestingPersonId: person.id, title: "A requisition", justification: "x", needStatement: "x", costCentreCode: "C1", accountCode: "C1", placeOfDelivery: "x",
      dateRequired: D("2026-12-31"), estimatedValue: "1000.00", raisedOn: D("2026-10-01"),
    },
  });
  exerciseId = (await db.sourcingExercise.create({ data: { organisationId, reference: `C1/EX/${tag}`, requisitionId: requisition.id, title: "An exercise", estimatedValue: "1000.00", sourcingMethodCode: "C1_METHOD" } })).id;
  const s = await makeSupplierAccount(organisationId);
  supplierId = s.supplier.id;
  accountId = s.account!.id;
  await db.supplier.update({ where: { id: supplierId }, data: { status: "REGISTERED", registeredOn: D("2026-01-01") } });
  const doc = await db.supplierDocument.create({
    data: {
      organisationId, supplierId, typeId, typeLabelSnapshot: "Board certificate", reference: "BC-1", issuingAuthority: "Board", validFrom: D("2026-01-01"), expiresOn: D("2028-01-01"), lodgedOn: D("2026-01-02"), recordedAt: new Date(),
      recordedBySupplierAccountId: accountId, verification: "VERIFIED", verifiedOn: D("2026-01-03"), verifiedAt: new Date(),
      values: { create: [{ organisationId, registrationValueId: g7, kind: "GRADE", codeSnapshot: "G7", labelSnapshot: "Grade seven" }, { organisationId, registrationValueId: catB, kind: "CATEGORY", codeSnapshot: "B", labelSnapshot: "Buildings" }] },
    },
  });
  void doc;
});

const org = () => ({ id: organisationId, timeZone: "Asia/Kuala_Lumpur", today: "2026-10-09" });

describe("needs are written with the requirement and deleted with it (615-C1)", () => {
  it("snapshots the code and name, composes the words when none were typed, and removes the needs with the requirement", async () => {
    const values = await loadNeedValues(organisationId);
    const choices = [{ kind: "GRADE" as const, valueId: g5 }, { kind: "CATEGORY" as const, valueId: catB }];
    expect(needFaults(choices, values, { code: bodyCode, qualifierLabelEn: "grade and category" }, "2026-10-09")).toEqual([]);
    const made = await db.$transaction((tx) => createRequirement(tx, { organisationId, exerciseId, body: { code: bodyCode, labelEn: "the works board", qualifierLabelEn: "grade and category" }, qualifiers: "", alternativeGroup: 1, sortOrder: 0, choices, values }));
    expect(made.composed).toBe(true);
    expect(made.qualifiers).toBe("minimum grade G5 — Grade five; category B — Buildings");
    const row = await db.exerciseRegistrationRequirement.findUniqueOrThrow({ where: { id: made.id }, include: { needs: true } });
    expect(row.qualifiersFromNeeds).toBe(true);
    expect(row.needs.map((n) => [n.kind, n.codeSnapshot, n.labelSnapshot]).sort()).toEqual([["CATEGORY", "B", "B — Buildings"], ["GRADE", "G5", "G5 — Grade five"]]);
    await db.$transaction((tx) => deleteRequirement(tx, organisationId, made.id));
    expect(await db.exerciseRequirementNeed.count({ where: { requirementId: made.id } })).toBe(0);
    expect(await db.exerciseRegistrationRequirement.count({ where: { id: made.id } })).toBe(0);
  });

  it("words typed by the officer are kept as typed, and not marked composed", async () => {
    const values = await loadNeedValues(organisationId);
    const made = await db.$transaction((tx) => createRequirement(tx, { organisationId, exerciseId, body: { code: bodyCode, labelEn: "the works board", qualifierLabelEn: "grade and category" }, qualifiers: "grade D4 and good standing", alternativeGroup: 2, sortOrder: 0, choices: [{ kind: "GRADE", valueId: g5 }], values }));
    expect(made.composed).toBe(false);
    expect(made.qualifiers).toBe("grade D4 and good standing");
    await db.$transaction((tx) => deleteRequirement(tx, organisationId, made.id));
  });

  it("the database refuses two grades on one requirement and a kind that is not a need", async () => {
    const values = await loadNeedValues(organisationId);
    const made = await db.$transaction((tx) => createRequirement(tx, { organisationId, exerciseId, body: { code: bodyCode, labelEn: "the works board", qualifierLabelEn: "grade and category" }, qualifiers: "x", alternativeGroup: 3, sortOrder: 0, choices: [{ kind: "GRADE", valueId: g5 }], values }));
    await expect(db.exerciseRequirementNeed.create({ data: { organisationId, requirementId: made.id, registrationValueId: g7, kind: "GRADE", codeSnapshot: "G7", labelSnapshot: "G7 — Grade seven" } })).rejects.toThrow();
    const classValue = await db.registrationValue.create({ data: { organisationId, bodyId: (await db.registrationBody.findFirstOrThrow({ where: { organisationId, code: bodyCode } })).id, kind: "CLASS", code: "CL1", nameEn: "A class", provenance: "ASSUMED" } });
    await expect(db.exerciseRequirementNeed.create({ data: { organisationId, requirementId: made.id, registrationValueId: classValue.id, kind: "CLASS", codeSnapshot: "CL1", labelSnapshot: "CL1 — A class" } })).rejects.toThrow();
    await db.$transaction((tx) => deleteRequirement(tx, organisationId, made.id));
  });
});

describe("eligibility reads the stored needs (615-C1)", () => {
  it("compares the grade by its rank as it reads now, and does not read composed words as a second condition", async () => {
    const values = await loadNeedValues(organisationId);
    const made = await db.$transaction((tx) => createRequirement(tx, { organisationId, exerciseId, body: { code: bodyCode, labelEn: "the works board", qualifierLabelEn: "grade and category" }, qualifiers: "", alternativeGroup: 1, sortOrder: 0, choices: [{ kind: "GRADE", valueId: g5 }, { kind: "FIELD_CODE", valueId: fieldA }], values }));
    try {
      const first = await eligibilityOf(supplierId, exerciseId, org());
      const rows = first!.eligibility.rows.filter((r) => r.requirementId === made.id);
      expect(rows.find((r) => r.kind === "GRADE")).toMatchObject({ result: "PASS", reason: "GRADE_MET" });
      expect(rows.find((r) => r.kind === "FIELD_CODES")).toMatchObject({ result: "FAIL", reason: "FIELD_CODES_MISSING", data: { missing: "12 — Water" } });
      expect(rows.find((r) => r.kind === "QUALIFIERS")).toBeUndefined();
      // The grade the supplier holds has its rank corrected below the one asked for: the next reading follows the configuration, not a copy taken when the requirement was entered.
      await db.registrationValue.update({ where: { id: g7 }, data: { rank: 3 } });
      const second = await eligibilityOf(supplierId, exerciseId, org());
      expect(second!.eligibility.rows.find((r) => r.requirementId === made.id && r.kind === "GRADE")).toMatchObject({ result: "FAIL", reason: "GRADE_BELOW" });
    } finally {
      await db.registrationValue.update({ where: { id: g7 }, data: { rank: 7 } });
      await db.$transaction((tx) => deleteRequirement(tx, organisationId, made.id));
    }
  });
});
