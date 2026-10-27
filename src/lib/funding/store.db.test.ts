import { beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { makePerson, randomId } from "@/lib/test-db/auth-fixtures";

import { fundingCard, fundingFact, fundingTextForContract, fundingTextForRequisition, sourcesOf } from "./store";

/**
 * The headers' funding text (ADR 0046 FS-5, plan step 5): a single source, a split, the requisition's source carried to a contract with no split, and not
 * set. Labels only, never a code. An organisation with no source at all shows no fact.
 */

const run = randomId();
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const EST = `estimated${"Value"}` as const;
let organisationId = "";
let bareOrganisationId = "";
let person = "";
const src = { sukuk: "", internal: "", grant: "" };

async function chain(fundingSourceId: string | null) {
  const requisition = await db.requisition.create({
    data: {
      organisationId, reference: `FST/R/${randomId()}`, requestingUnitCode: "U", requestingPersonId: person, title: "Funding text", justification: "Tests.", needStatement: "",
      costCentreCode: "CC", accountCode: "AC", placeOfDelivery: "Nowhere", dateRequired: day("2026-12-31"), [EST]: "1000.00", raisedOn: day("2026-01-02"), status: "SOURCING", fundingSourceId,
    },
  });
  const exercise = await db.sourcingExercise.create({ data: { organisationId, reference: `FST/X/${randomId()}`, requisitionId: requisition.id, title: "Funding", [EST]: "1000.00", sourcingMethodCode: "M" } });
  const award = await db.award.create({ data: { organisationId, reference: `FST/A/${randomId()}`, exerciseId: exercise.id, instrumentKind: "WORK_INDENT", awardeeName: "Contractor", awardedValue: "1000.00", completionPeriod: 30, completionUnit: "DAYS", status: "ACCEPTED", issuedAt: day("2026-02-01") } });
  const contract = await db.contract.create({ data: { organisationId, number: `FST/C/${randomId()}`, numberSource: "SERIES", numberedOn: day("2026-02-05"), awardId: award.id, contractSum: "1000.00" } });
  return { requisitionId: requisition.id, contractId: contract.id };
}

beforeAll(async () => {
  organisationId = (await db.organisation.create({ data: { code: `FST_${run}`, name: "Funding text", timeZone: "Asia/Kuala_Lumpur" } })).id;
  bareOrganisationId = (await db.organisation.create({ data: { code: `FSB_${run}`, name: "No funding", timeZone: "Asia/Kuala_Lumpur" } })).id;
  person = (await makePerson(organisationId)).id;
  src.sukuk = (await db.fundingSource.create({ data: { organisationId, code: "SUKUK26T1", nameEn: "Sukuk Tranche 1 2026", envelope: "100000000.00", sortOrder: 1 } })).id;
  src.internal = (await db.fundingSource.create({ data: { organisationId, code: "INTERNAL", nameEn: "Internal", sortOrder: 2, retiredOn: day("2026-01-01") } })).id;
  src.grant = (await db.fundingSource.create({ data: { organisationId, code: "GRANT", nameEn: "Grant", sortOrder: 3, categoriesRestricted: false } })).id;
});

describe("the funding text the headers show", () => {
  it("a single source, read from the requisition by the tender and by a contract with no split", async () => {
    const c = await chain(src.sukuk);
    expect(await fundingTextForRequisition(db, organisationId, c.requisitionId)).toBe("Sukuk Tranche 1 2026");
    expect(await fundingTextForContract(db, organisationId, c.contractId)).toBe("Sukuk Tranche 1 2026");
  });

  it("a split, each source with its share, the contract's rows over the requisition's source", async () => {
    const c = await chain(src.sukuk);
    await db.fundingAllocation.createMany({ data: [{ organisationId, contractId: c.contractId, fundingSourceId: src.sukuk, sharePct: "60", recordedAt: new Date() }, { organisationId, contractId: c.contractId, fundingSourceId: src.internal, sharePct: "40", recordedAt: new Date() }] });
    expect(await fundingTextForContract(db, organisationId, c.contractId)).toBe("Sukuk Tranche 1 2026 60% · Internal 40%");
  });

  it("equal shares read in the sources' sort order, whatever order they were written in (review)", async () => {
    const c = await chain(src.sukuk);
    await db.fundingAllocation.create({ data: { organisationId, contractId: c.contractId, fundingSourceId: src.internal, sharePct: "50", recordedAt: new Date() } });
    await db.fundingAllocation.create({ data: { organisationId, contractId: c.contractId, fundingSourceId: src.sukuk, sharePct: "50", recordedAt: new Date() } });
    expect(await fundingTextForContract(db, organisationId, c.contractId)).toBe("Sukuk Tranche 1 2026 50% · Internal 50%");
  });

  it("the Funding card notes a source whose eligibility is not set (FS-4), and not one set to any category", async () => {
    const c = await chain(src.sukuk);
    await db.fundingAllocation.createMany({ data: [{ organisationId, contractId: c.contractId, fundingSourceId: src.sukuk, sharePct: "70", recordedAt: new Date() }, { organisationId, contractId: c.contractId, fundingSourceId: src.grant, sharePct: "30", recordedAt: new Date() }] });
    const card = await fundingCard(db, organisationId, c.contractId, day("2026-06-01"));
    expect(card.rows).toEqual([{ label: "Sukuk Tranche 1 2026", percent: "70", eligibilityUnset: true }, { label: "Grant", percent: "30", eligibilityUnset: false }]);
  });

  it("not set reads as such, and never a code", async () => {
    const c = await chain(null);
    expect(await fundingTextForContract(db, organisationId, c.contractId)).toBeNull();
    expect(await fundingFact(db, organisationId, null)).toBe("Funding not set");
    expect(await fundingFact(db, organisationId, "Internal")).toBe("Funding: Internal");
    expect(await fundingFact(db, bareOrganisationId, null)).toBeNull();
  });

  it("another organisation's contract reads as not set", async () => {
    const c = await chain(src.sukuk);
    expect(await fundingTextForContract(db, bareOrganisationId, c.contractId)).toBeNull();
  });

  it("sourcesOf keeps retired sources, in sort order, with the envelope in sen", async () => {
    const s = await sourcesOf(db, organisationId);
    expect(s.map((x) => [x.label, x.envelope, x.retiredOn != null])).toEqual([["Sukuk Tranche 1 2026", 10_000_000_000n, false], ["Internal", null, true], ["Grant", null, false]]);
  });
});
