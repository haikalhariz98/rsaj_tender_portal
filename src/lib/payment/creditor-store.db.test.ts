import { beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { makeSupplierAccount, testOrganisation } from "@/lib/test-db/auth-fixtures";

import { creditorFactsOf } from "./creditor-store";
import { creditorFaults } from "./eligibility";

/**
 * BD-613-44 against a real database (Phase 4b): what a payment is judged on is read from the stored profiles of the AWARD's supplier. A newer version that is sent and not yet checked
 * leaves the earlier checked one in force; a version still being filled in is not a version at all; a supplier with nothing checked is refused.
 */

let organisationId = "";
let officer = "";

beforeAll(async () => {
  organisationId = (await testOrganisation()).id;
  officer = (await db.person.create({ data: { organisationId, name: "Checking Officer" } })).id;
});

async function supplierWith(versions: { verification: "NOT_CHECKED" | "VERIFIED" | "NOT_IN_ORDER"; sent: boolean }[]) {
  const s = await makeSupplierAccount(organisationId);
  let previous: string | null = null;
  for (const [i, v] of versions.entries()) {
    const checked = v.verification !== "NOT_CHECKED";
    const row: { id: string } = await db.creditorProfile.create({
      data: {
        organisationId,
        supplierId: s.supplier.id,
        version: i + 1,
        supersedesId: previous,
        beneficiaryName: "Beneficiary",
        enteredBySupplierAccountId: s.account!.id,
        submittedAt: v.sent ? new Date("2026-10-02T02:00:00Z") : null,
        ...(checked ? { verification: v.verification, verifiedByPersonId: officer, verifiedOn: new Date("2026-10-03T00:00:00Z"), verifiedAt: new Date("2026-10-03T02:00:00Z") } : {}),
      },
    });
    previous = row.id;
  }
  return s.supplier.id;
}

const faultsFor = async (vendorId: string | null) => creditorFaults(await creditorFactsOf(db, organisationId, vendorId)).map((f) => [f.code, f.data?.reason ?? null]);

describe("the bank details a payment is judged on", () => {
  it("a checked version makes the supplier payable, and a newer unchecked one does not displace it", async () => {
    expect(await faultsFor(await supplierWith([{ verification: "VERIFIED", sent: true }]))).toEqual([]);
    expect(await faultsFor(await supplierWith([{ verification: "VERIFIED", sent: true }, { verification: "NOT_CHECKED", sent: true }]))).toEqual([]);
  });

  it("nothing checked refuses the payment, and says which: nothing sent, waiting for a check, or found not in order", async () => {
    expect(await faultsFor(await supplierWith([]))).toEqual([["CREDITOR_NOT_VERIFIED", "NOT_ENTERED"]]);
    expect(await faultsFor(await supplierWith([{ verification: "NOT_CHECKED", sent: false }]))).toEqual([["CREDITOR_NOT_VERIFIED", "NOT_ENTERED"]]);
    expect(await faultsFor(await supplierWith([{ verification: "NOT_CHECKED", sent: true }]))).toEqual([["CREDITOR_NOT_VERIFIED", "AWAITING_CHECK"]]);
    expect(await faultsFor(await supplierWith([{ verification: "NOT_IN_ORDER", sent: true }]))).toEqual([["CREDITOR_NOT_VERIFIED", "NOT_IN_ORDER"]]);
  });

  it("an award that names no supplier is refused as not on the register, whoever else has a checked profile", async () => {
    await supplierWith([{ verification: "VERIFIED", sent: true }]);
    expect(await faultsFor(null)).toEqual([["CONTRACTOR_NOT_ON_REGISTER", null]]);
  });

  it("reads one supplier's versions in one organisation: a supplier id from elsewhere finds nothing", async () => {
    const id = await supplierWith([{ verification: "VERIFIED", sent: true }]);
    const facts = await creditorFactsOf(db, "another_organisation", id);
    expect(facts.versions).toEqual([]);
    expect(creditorFaults(facts).map((f) => f.code)).toEqual(["CREDITOR_NOT_VERIFIED"]);
  });
});
