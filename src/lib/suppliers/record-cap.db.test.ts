import { beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { makePerson, randomId } from "@/lib/test-db/auth-fixtures";

import { loadSupplier, SUPPLIER_PARTIES_MAX, supplierHistory } from "./repo";

/**
 * Phase 0.2 item 7 (NFR-PRF-001 near-target risk, 2026-10-25): the supplier record reads only its latest SUPPLIER_PARTIES_MAX exercise links, with
 * the true count of the visible ones; a link on a hidden exercise is neither read nor counted; the History still covers every link.
 */

const run = randomId();
let org = "";
let supplierId = "";
let oldestParty = "";
let hiddenExercise = "";

beforeAll(async () => {
  // Its own organisation: 202 exercises would move any count another test takes in a shared one.
  org = (await db.organisation.create({ data: { code: `CAP_${run}`, name: "Supplier record cap", timeZone: "Asia/Kuala_Lumpur" } })).id;
  const person = await makePerson(org);
  const req = await db.requisition.create({
    data: {
      organisationId: org, reference: `CAP/REQ/${run}`, requestingUnitCode: "CAP_UNIT", requestingPersonId: person.id, title: "Capped supplier", justification: "Tests.", needStatement: "None.",
      costCentreCode: "CAP_CC", accountCode: "CAP_AC", placeOfDelivery: "Nowhere", dateRequired: new Date("2026-12-31T00:00:00Z"), estimatedValue: "1.00", raisedOn: new Date("2026-10-01T00:00:00Z"),
    },
  });
  const supplier = await db.supplier.create({
    data: { organisationId: org, reference: `CAP/V/${run}`, registeredName: `Capped ${run} Sdn Bhd`, registrationNo: `CAP${run}`, registrationNoKey: `CAP${run}`, entityTypeCode: "CAP_TYPE", countryCode: "my", registeredAddress: "Nowhere", companyEmail: "c@example.invalid" },
  });
  supplierId = supplier.id;
  // One more visible link than the cap, plus one on a hidden exercise; one party per exercise (R-12). Created one by one so the order is the creation order.
  for (let i = 0; i <= SUPPLIER_PARTIES_MAX + 1; i++) {
    const ex = await db.sourcingExercise.create({ data: { organisationId: org, reference: `CAP/EX/${run}/${i}`, requisitionId: req.id, title: `Capped ${i}`, estimatedValue: "1.00", sourcingMethodCode: "CAP_METHOD" } });
    const party = await db.exerciseParty.create({ data: { organisationId: org, exerciseId: ex.id, source: "PURCHASER", name: `Capped ${run}`, registrationNo: `CAP${run}`, vendorId: supplierId } });
    if (i === 0) oldestParty = party.id;
    if (i === SUPPLIER_PARTIES_MAX + 1) hiddenExercise = ex.id;
  }
  await db.auditEntry.create({ data: { organisationId: org, entity: "ExerciseParty", entityId: oldestParty, entityLabel: `CAP/EX/${run}/0 · link`, action: "UPDATE", changes: [] } });
}, 120_000);

describe("the supplier record's exercise links", () => {
  it("reads the latest SUPPLIER_PARTIES_MAX, oldest first, and counts every visible one", async () => {
    const l = (await loadSupplier(org, supplierId, [hiddenExercise]))!;
    expect(l.supplier.parties).toHaveLength(SUPPLIER_PARTIES_MAX);
    expect(l.supplier.partiesTotal).toBe(SUPPLIER_PARTIES_MAX + 1);
    expect(l.supplier.parties.map((p) => p.id)).not.toContain(oldestParty);
    expect(l.supplier.parties.some((p) => p.exerciseId === hiddenExercise)).toBe(false);
    const refs = l.supplier.parties.map((p) => Number(p.exercise.reference.split("/").pop()));
    expect(refs).toEqual([...refs].sort((a, b) => a - b));
  });
  it("counts the hidden exercise's link only for a reader who may see it", async () => {
    expect((await loadSupplier(org, supplierId, []))!.supplier.partiesTotal).toBe(SUPPLIER_PARTIES_MAX + 2);
  });
  it("keeps the History of a link the record no longer reads", async () => {
    const h = await supplierHistory((await loadSupplier(org, supplierId, [hiddenExercise]))!);
    expect(h.entries.some((e) => e.entity === "ExerciseParty")).toBe(true);
  });
});
