import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { makeSupplierAccount, randomId, testOrganisation } from "@/lib/test-db/auth-fixtures";

import { displacedDocumentIds, inForceDocumentWhere, lapsedMandatoryWhere } from "./repo";

/**
 * 615-C7 against a real database: the watched lists read a renewal chain one link deep. A chain renewed twice with an unverified link between (A verified, B waiting, C verified and
 * started) left A looking in force, so A's older expiry showed on the Expiring list and counted as a lapse. The documents a deeper link displaces are named from the whole register.
 */

let organisationId: string;
let typeId: string;
let accountId: string;
let supplierId: string;

const D = (day: string) => new Date(`${day}T00:00:00.000Z`);

beforeAll(async () => {
  organisationId = (await testOrganisation()).id;
  const t = await db.supplierDocumentType.upsert({
    where: { organisationId_code: { organisationId, code: "c7_type" } },
    update: { mandatoryAtRegistration: true, expires: true, retiredOn: null },
    create: { organisationId, code: "c7_type", nameEn: "A certificate", provenance: "ASSUMED", expires: true, mandatoryAtRegistration: true, notApplicableAllowed: false },
  });
  typeId = t.id;
  const s = await makeSupplierAccount(organisationId);
  accountId = s.account!.id;
  supplierId = s.supplier.id;
});

// The scratch organisation is shared: this type is mandatory for the lapse tests, and is retired when they are done so no other file's registration is asked for it.
afterAll(async () => {
  await db.supplierDocumentType.updateMany({ where: { organisationId, code: "c7_type" }, data: { retiredOn: D("2000-01-01") } });
});

async function lodge(o: { supersedesId?: string | null; verification: "VERIFIED" | "NOT_CHECKED" | "NOT_IN_ORDER"; expiresOn: string; validFrom?: string | null }) {
  return db.supplierDocument.create({
    data: {
      organisationId,
      supplierId,
      typeId,
      typeLabelSnapshot: "A certificate",
      reference: `C7-${randomId()}`,
      issuingAuthority: "Authority",
      expiresOn: D(o.expiresOn),
      validFrom: o.validFrom ? D(o.validFrom) : null,
      supersedesId: o.supersedesId ?? null,
      lodgedOn: D("2026-09-01"),
      recordedAt: new Date(),
      recordedBySupplierAccountId: accountId,
      verification: o.verification,
      ...(o.verification === "NOT_CHECKED" ? {} : { verifiedOn: D("2026-09-02"), verifiedAt: new Date() }),
    },
  });
}

describe("a chain renewed twice with an unverified link between (615-C7)", () => {
  it("names the first document as displaced, and the query leaves it out of 'in force'", async () => {
    const a = await lodge({ verification: "VERIFIED", expiresOn: "2026-10-20" });
    const b = await lodge({ supersedesId: a.id, verification: "NOT_CHECKED", expiresOn: "2027-10-20" });
    const c = await lodge({ supersedesId: b.id, verification: "VERIFIED", expiresOn: "2028-10-20" });
    const today = "2026-10-09";
    // The one-link query alone is the fault: A's own renewal is waiting, so A is counted in force.
    const oneLink = await db.supplierDocument.findMany({ where: { supplierId, ...inForceDocumentWhere(today) }, select: { id: true } });
    expect(oneLink.map((x) => x.id).sort()).toEqual([a.id, c.id].sort());
    const displaced = await displacedDocumentIds(organisationId, today);
    expect(displaced).toContain(a.id);
    expect(displaced).not.toContain(c.id);
    const inForce = await db.supplierDocument.findMany({ where: { supplierId, ...inForceDocumentWhere(today, displaced) }, select: { id: true } });
    expect(inForce.map((x) => x.id)).toEqual([c.id]);
    // Expiring in the next 30 days: A's old expiry no longer shows.
    const expiring = await db.supplierDocument.count({ where: { supplierId, ...inForceDocumentWhere(today, displaced), expiresOn: { not: null, lte: D("2026-11-09") } } });
    expect(expiring).toBe(0);
    // And it is not a lapse after A's day has passed.
    const lapsed = await db.supplierDocument.count({ where: { supplierId, ...lapsedMandatoryWhere("2026-10-25", await displacedDocumentIds(organisationId, "2026-10-25")) } });
    expect(lapsed).toBe(0);
    expect(await db.supplierDocument.count({ where: { supplierId, ...lapsedMandatoryWhere("2026-10-25") } })).toBe(1);
  });

  it("a deeper link that starts later displaces nothing until its first valid day", async () => {
    const s = await makeSupplierAccount(organisationId);
    accountId = s.account!.id;
    supplierId = s.supplier.id;
    const a = await lodge({ verification: "VERIFIED", expiresOn: "2026-10-20" });
    const b = await lodge({ supersedesId: a.id, verification: "NOT_IN_ORDER", expiresOn: "2027-10-20" });
    await lodge({ supersedesId: b.id, verification: "VERIFIED", expiresOn: "2028-10-20", validFrom: "2026-11-01" });
    expect(await displacedDocumentIds(organisationId, "2026-10-09")).not.toContain(a.id);
    expect(await displacedDocumentIds(organisationId, "2026-11-01")).toContain(a.id);
  });
});
