/**
 * Demo data for BD-613-44: a contractor that can be PAID. A payment certificate issues only to a contractor whose creditor profile an officer has checked, and the contractor's award has
 * to name it on the supplier register (`Award.vendorId`). The life of demo_con13 (prisma/demo-lifecycle.ts) issues three interim certificates through the product's own acts, so its awardee
 * is put on the register with bank details an officer has checked, before its award is made. Invented throughout: the bank, the account and the numbers are obviously not real, and no
 * bank value is written to the trail (only that a profile was sent and checked).
 *
 * The contractor's portal account waits for activation (it holds the hash of a secret nobody knows), as the registration demonstration's do.
 */

import { randomBytes } from "node:crypto";

import type { PrismaClient } from "../src/generated/prisma/client";
import { loginKeyOf } from "../src/lib/auth/identity";
import { hashPassword } from "../src/lib/auth/password";
import { dayToDate } from "../src/lib/dates";
import { issueReference } from "../src/lib/numbering/issue";
import { normaliseRegistrationNo } from "../src/lib/suppliers/identity";
import { DEMO_ACTOR } from "./demo-actor";

type Db = PrismaClient;
const P = "demo_";
const OFFICER_ID = `${P}p4`;

export interface DemoContractor {
  /// Row ids are derived from this (`demo_<key>`).
  key: string;
  name: string;
  registrationNo: string;
  address: string;
  /// YYYY-MM-DD: the day the supplier was registered, and the day (a day later) its bank details were checked.
  registeredOn: string;
}

/// Put the contractor on the register with bank details an officer has checked. Returns the supplier's id, for the award to name.
export async function createRegisteredContractor(db: Db, organisationId: string, c: DemoContractor): Promise<string> {
  const id = `${P}${c.key}`;
  const at = (offsetDays: number, time: string) => {
    const d = dayToDate(c.registeredOn);
    d.setUTCDate(d.getUTCDate() + offsetDays);
    return new Date(`${d.toISOString().slice(0, 10)}T${time}:00.000Z`);
  };
  const registered = at(0, "02:00");
  const checked = at(1, "03:00");
  const reference = await db.$transaction((tx) => issueReference(tx as never, organisationId, "supplier", dayToDate(c.registeredOn)));
  await db.supplier.create({
    data: {
      id, organisationId, reference, registeredName: c.name, registrationNo: c.registrationNo, registrationNoKey: normaliseRegistrationNo(c.registrationNo), entityTypeCode: "private_limited", countryCode: "demo_home",
      registeredAddress: c.address, companyEmail: `accounts@${c.key}.invalid`, status: "REGISTERED", registeredOn: dayToDate(c.registeredOn), createdAt: registered,
    },
  });
  await db.supplierContact.create({ data: { id: `${id}_contact`, organisationId, supplierId: id, name: "Demo Contractor Contact", designation: "Director", email: `contact@${c.key}.invalid`, phone: "012-000 0013", isPrimary: true, createdAt: registered } });
  await db.supplierAccount.create({
    data: { id: `${id}_account`, organisationId, contactId: `${id}_contact`, supplierId: id, loginName: `demo.${c.key}`, loginKey: loginKeyOf(`demo.${c.key}`), passwordHash: await hashPassword(randomBytes(32).toString("base64url")), passwordChangedAt: registered, status: "PENDING_ACTIVATION" },
  });
  // Version one, sent and then checked by the demonstration's registering officer. Obviously not a real bank or account.
  await db.creditorProfile.create({
    data: {
      id: `${id}_creditor`, organisationId, supplierId: id, version: 1, beneficiaryName: c.name, beneficiaryAddress: c.address, beneficiaryIdentityNo: c.registrationNo, beneficiaryContactPerson: "Demo Contractor Contact", beneficiaryTelephone: "012-000 0013",
      beneficiaryEmail: `accounts@${c.key}.invalid`, bankCode: "demo_bank_a", bankAccountNo: "000013000013", bankAccountTypeCode: "demo_current", bankAddress: "1 Demo Bank Street, Demo City", enteredBySupplierAccountId: `${id}_account`,
      createdAt: registered, submittedAt: registered, verification: "VERIFIED", verifiedByPersonId: OFFICER_ID, verifiedOn: dayToDate(c.registeredOn), verifiedAt: checked, verificationNote: "Demonstration: checked against an invented statement",
    },
  });
  const entry = (entity: string, entityId: string, entityLabel: string, when: Date, changes: object[]) => ({ id: `${id}_au_${entity}`, organisationId, entity, entityId, entityLabel, action: "CREATE" as const, at: when, changes, reason: "", ...DEMO_ACTOR });
  await db.auditEntry.createMany({
    data: [
      entry("Supplier", id, `${reference} · ${c.name}`, registered, [{ field: "status", before: null, after: "Registered" }, { field: "registeredName", before: null, after: c.name }]),
      entry("CreditorProfile", `${id}_creditor`, `${reference} · Creditor's profile`, checked, [{ field: "status", before: null, after: "version 1 sent, and checked by an officer" }]),
    ] as never,
  });
  return id;
}
