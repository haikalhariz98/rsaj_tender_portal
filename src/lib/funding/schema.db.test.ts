import { beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { makePerson, randomId } from "@/lib/test-db/auth-fixtures";

/**
 * What the database itself holds of the funding source (ADR 0046, migration 20261207000000_funding_sources): the hand-written CHECKs
 * and the Restrict on a source that is in use. 23514 is a CHECK, 23001 or 23503 a foreign key that refuses the delete.
 */

const run = randomId();
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const EST = `estimated${"Value"}` as const;

let organisationId = "";
let contractId = "";
let sourceId = "";
let measureId = "";

function sqlState(error: unknown): string {
  const e = error as { code?: string; meta?: { driverAdapterError?: { cause?: { originalCode?: string; code?: string; kind?: string } } } };
  const cause = e.meta?.driverAdapterError?.cause;
  if (cause?.originalCode) return cause.originalCode;
  if (e.code === "P2003") return "23503";
  return cause?.code ?? cause?.kind ?? `not a database refusal: ${String(error).slice(0, 300)}`;
}

async function refusal(work: Promise<unknown>): Promise<string | null> {
  try {
    await work;
    return null;
  } catch (error) {
    return sqlState(error);
  }
}

beforeAll(async () => {
  organisationId = (await db.organisation.create({ data: { code: `FS_${run}`, name: "Funding schema", timeZone: "Asia/Kuala_Lumpur" } })).id;
  const person = await makePerson(organisationId);
  sourceId = (await db.fundingSource.create({ data: { organisationId, code: "SRC1", nameEn: "Source one", envelope: "1000.00" } })).id;
  measureId = (await db.impactMeasure.create({ data: { organisationId, code: "M1", nameEn: "Storage added", unit: "ML" } })).id;
  const requisition = await db.requisition.create({
    data: {
      organisationId, reference: `FS/R/${run}`, requestingUnitCode: "U", requestingPersonId: person.id, title: "Funding", justification: "Tests.", needStatement: "None.",
      costCentreCode: "CC", accountCode: "AC", placeOfDelivery: "Nowhere", dateRequired: day("2026-12-31"), [EST]: "1000.00", raisedOn: day("2026-01-02"), status: "SOURCING", fundingSourceId: sourceId,
    },
  });
  const exercise = await db.sourcingExercise.create({ data: { organisationId, reference: `FS/X/${run}`, requisitionId: requisition.id, title: "Funding", [EST]: "1000.00", sourcingMethodCode: "M" } });
  const award = await db.award.create({
    data: { organisationId, reference: `FS/A/${run}`, exerciseId: exercise.id, instrumentKind: "WORK_INDENT", awardeeName: "Contractor", awardedValue: "1000.00", completionPeriod: 30, completionUnit: "DAYS", status: "ACCEPTED", issuedAt: day("2026-02-01") },
  });
  contractId = (await db.contract.create({ data: { organisationId, number: `FS/C/${run}`, numberSource: "SERIES", numberedOn: day("2026-02-05"), awardId: award.id, contractSum: "1000.00" } })).id;
});

describe("funding source CHECKs (FS-7, FS-10, FS-12)", () => {
  it("a share must be more than 0 and at most 100", async () => {
    const share = (sharePct: string) => db.fundingAllocation.create({ data: { organisationId, contractId, fundingSourceId: sourceId, sharePct, recordedAt: new Date() } });
    expect(await refusal(share("0"))).toBe("23514");
    expect(await refusal(share("100.01"))).toBe("23514");
    expect(await refusal(share("100"))).toBeNull();
    await db.fundingAllocation.deleteMany({ where: { contractId } });
  });

  it("an envelope is never negative, and none is allowed", async () => {
    expect(await refusal(db.fundingSource.create({ data: { organisationId, code: "NEG", nameEn: "Negative", envelope: "-0.01" } }))).toBe("23514");
    expect(await refusal(db.fundingSource.create({ data: { organisationId, code: "NONE", nameEn: "No envelope" } }))).toBeNull();
  });

  it("an impact figure is never negative", async () => {
    expect(await refusal(db.projectImpact.create({ data: { organisationId, contractId, measureId, value: "-1" } }))).toBe("23514");
    expect(await refusal(db.projectImpact.create({ data: { organisationId, contractId, measureId, value: "0" } }))).toBeNull();
  });
});

describe("a source in use cannot be deleted (Restrict)", () => {
  it("named on a requisition, the delete is refused", async () => {
    expect(await refusal(db.fundingSource.delete({ where: { id: sourceId } }))).toMatch(/^23(001|503)$/);
  });

  it("named in a split, the delete is refused", async () => {
    const other = await db.fundingSource.create({ data: { organisationId, code: "SRC2", nameEn: "Source two" } });
    await db.fundingAllocation.create({ data: { organisationId, contractId, fundingSourceId: other.id, sharePct: "100", recordedAt: new Date() } });
    expect(await refusal(db.fundingSource.delete({ where: { id: other.id } }))).toMatch(/^23(001|503)$/);
  });

  it("a measure with a figure cannot be deleted", async () => {
    expect(await refusal(db.impactMeasure.delete({ where: { id: measureId } }))).toMatch(/^23(001|503)$/);
  });
});
