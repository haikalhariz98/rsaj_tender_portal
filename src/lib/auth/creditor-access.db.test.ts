import { beforeAll, describe, expect, it } from "vitest";

import { sulitGate } from "@/app/_auth/sulit";
import { CREDITOR_PROFILE_FIELDS } from "@/lib/auth/creditor-access-store";
import type { PermissionKey, StaffActor } from "@/lib/auth/types";
import { db } from "@/lib/db";
import { makePerson, randomId } from "@/lib/test-db/auth-fixtures";

/**
 * Who may read a supplier's bank details, against the scratch database (Phase 4b, ruling 6 of the CPD registration rulings; ADR 0034 D14). The rule is worked out when read, from the facts:
 * the holders of a step on THIS supplier's registration route, whoever decided one, the officer who checked this version, and the staff the organisation has granted
 * `sulit.read.creditorProfile`. Everyone else is refused, in words that say what would open it, and the refusal is logged as a reading is. An administrator account is never entitled.
 */

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const run = randomId();
const OFFICE = `CR_OFFICE_${run}`;
const OFFICE_B = `CR_OFFICE_B_${run}`;
const OFFICE_C = `CR_OFFICE_C_${run}`;

let organisationId = "";
let profileA = "";
let profileA2 = "";
let profileB = "";
let supplierA = "";
let supplierB = "";
const p = { holder: "", decider: "", verifier: "", grantee: "", finance: "", otherHolder: "", secondHolder: "", admin: "", recorder: "" };

const staff = (personId: string, o: { admin?: boolean; permissions?: PermissionKey[] } = {}): StaffActor => ({
  kind: "STAFF",
  accountId: `acc_${personId}`,
  sessionId: `ses_${personId}`,
  personId,
  personName: "Reader",
  jobTitle: null,
  isAdministrator: o.admin === true,
  organisationId,
  organisationCode: `CR_${run}`,
  organisationTimeZone: "Asia/Kuala_Lumpur",
  offices: [],
  permissions: new Set(o.permissions ?? []),
  stepUpAt: null,
  sessionCreatedAt: new Date(),
  sourceAddress: "203.0.113.7",
  mustChangePassword: false,
});

const subject = (id: string, supplierId: string, verifiedByPersonId: string | null = null) => ({ scope: "creditorProfile" as const, id, label: `CR/${run} · Creditor's profile`, supplierId, verifiedByPersonId });
const logged = (entityId: string) => db.sulitAccessEvent.findMany({ where: { organisationId, entityId, scope: "creditorProfile" }, orderBy: { at: "asc" } });

async function makeSupplier(tag: string) {
  const s = await db.supplier.create({ data: { organisationId, reference: `CR/${run}/${tag}`, registeredName: `Supplier ${tag}`, registrationNo: `CR-${run}-${tag}`, registrationNoKey: `CR-${run}-${tag}`.toUpperCase(), entityTypeCode: "x", countryCode: "x", registeredAddress: "Somewhere", companyEmail: `${tag}@x.invalid` } });
  const app = await db.supplierApplication.create({ data: { organisationId, supplierId: s.id, kind: "NEW", receivedOn: day("2026-10-01"), channel: "COUNTER", recordedByPersonId: p.recorder, recordedAt: new Date("2026-10-01T02:00:00Z") } });
  return { supplier: s, application: app };
}

const account = (supplierId: string, tag: string) =>
  db.supplierContact
    .create({ data: { organisationId, supplierId, name: `Contact ${tag}`, isPrimary: true } })
    .then((c) => db.supplierAccount.create({ data: { organisationId, contactId: c.id, supplierId, loginName: `cr.${tag}.${run}`, loginKey: `cr.${tag}.${run}`, passwordHash: "x", passwordChangedAt: new Date(), status: "ACTIVE" } }));

beforeAll(async () => {
  const org = await db.organisation.create({ data: { code: `CR_${run}`, name: "Creditor access test organisation", timeZone: "Asia/Kuala_Lumpur" } });
  organisationId = org.id;
  for (const k of Object.keys(p) as (keyof typeof p)[]) p[k] = (await makePerson(organisationId, `Creditor ${k} ${run}`)).id;
  await db.authorityRole.createMany({
    data: [
      { organisationId, code: OFFICE, nameEn: `Office ${run}`, nameMs: `Pejabat ${run}` },
      { organisationId, code: OFFICE_B, nameEn: `Office B ${run}`, nameMs: `Pejabat B ${run}` },
      { organisationId, code: OFFICE_C, nameEn: `Office C ${run}`, nameMs: `Pejabat C ${run}` },
    ],
  });
  await db.roleAssignment.createMany({
    data: [
      { personId: p.holder, roleCode: OFFICE, effectiveFrom: day("2020-01-01") },
      { personId: p.otherHolder, roleCode: OFFICE_B, effectiveFrom: day("2020-01-01") },
      { personId: p.secondHolder, roleCode: OFFICE_C, effectiveFrom: day("2020-01-01") },
    ],
  });
  const a = await makeSupplier("A");
  const b = await makeSupplier("B");
  supplierA = a.supplier.id;
  supplierB = b.supplier.id;
  const accountA = await account(supplierA, "a");
  const accountB = await account(supplierB, "b");
  // The registration route of A has one decided step and one pending; B's has its own pending step, held by someone else.
  const routeA = await db.approvalInstance.create({ data: { organisationId, matterKind: "SUPPLIER", supplierApplicationId: a.application.id, domain: "supplier_registration", openedAt: new Date("2026-10-03T02:00:00Z") } });
  await db.approvalStep.create({ data: { instanceId: routeA.id, sequence: 1, roleCode: OFFICE, roleLabel: "First", act: "A", decision: "DONE", decidedByPersonId: p.decider, decidedOn: day("2026-10-04") } });
  await db.approvalStep.create({ data: { instanceId: routeA.id, sequence: 2, roleCode: OFFICE, roleLabel: "Second", act: "A" } });
  const routeB = await db.approvalInstance.create({ data: { organisationId, matterKind: "SUPPLIER", supplierApplicationId: b.application.id, domain: "supplier_registration", openedAt: new Date("2026-10-03T02:00:00Z") } });
  await db.approvalStep.create({ data: { instanceId: routeB.id, sequence: 1, roleCode: OFFICE_B, roleLabel: "Only", act: "A" } });
  // A second application of the SAME supplier (an earlier one that was rejected, or a renewal), with a route of its own held by someone else: the profile sent with it is named by that route, and by no other.
  const appA2 = await db.supplierApplication.create({ data: { organisationId, supplierId: supplierA, kind: "RENEWAL", status: "REJECTED", receivedOn: day("2026-10-05"), channel: "COUNTER", recordedByPersonId: p.recorder, recordedAt: new Date("2026-10-05T02:00:00Z") } });
  const routeA2 = await db.approvalInstance.create({ data: { organisationId, matterKind: "SUPPLIER", supplierApplicationId: appA2.id, domain: "supplier_registration", openedAt: new Date("2026-10-06T02:00:00Z") } });
  await db.approvalStep.create({ data: { instanceId: routeA2.id, sequence: 1, roleCode: OFFICE_C, roleLabel: "Only", act: "A" } });
  const base = { organisationId, beneficiaryName: "Beneficiary", bankCode: "b", bankAccountNo: "1234567890", bankAccountTypeCode: "c", submittedAt: new Date("2026-10-02T02:00:00Z") };
  // Version 1 of A was checked by the verifier; version 2 was sent after and waits.
  const v1 = await db.creditorProfile.create({ data: { ...base, supplierId: supplierA, version: 1, enteredBySupplierAccountId: accountA.id, verification: "VERIFIED", verifiedByPersonId: p.verifier, verifiedOn: day("2026-10-03"), verifiedAt: new Date("2026-10-03T02:00:00Z") } });
  profileA = v1.id;
  profileA2 = (await db.creditorProfile.create({ data: { ...base, supplierId: supplierA, version: 2, supersedesId: v1.id, enteredBySupplierAccountId: accountA.id } })).id;
  profileB = (await db.creditorProfile.create({ data: { ...base, supplierId: supplierB, version: 1, enteredBySupplierAccountId: accountB.id } })).id;
  // Which application each profile was sent with: the application of its GIRO authorisation.
  const text = await db.declarationText.create({ data: { organisationId, kind: "GIRO_AUTHORISATION", version: 1, bodyEn: "x", provenance: "ASSUMED", issuedOn: day("2026-01-01") } });
  const sentWith = (applicationId: string, creditorProfileId: string, accountId: string) =>
    db.registrationDeclaration.create({ data: { organisationId, applicationId, creditorProfileId, kind: "GIRO_AUTHORISATION", textId: text.id, textVersion: 1, textSha256: "0".repeat(64), frozenTextEn: "x", signatoryName: "S", signatoryDesignation: "D", signedOn: day("2026-10-02"), signedAt: new Date("2026-10-02T02:00:00Z"), signedBySupplierAccountId: accountId } });
  await sentWith(a.application.id, profileA, accountA.id);
  await sentWith(appA2.id, profileA2, accountA.id);
  await sentWith(b.application.id, profileB, accountB.id);
});

describe("a supplier's bank details name whoever its registration route and the check name", () => {
  it("opens to the holder of a pending step of THIS supplier's route, and logs the reading", async () => {
    const g = await sulitGate(staff(p.holder), subject(profileA, supplierA), CREDITOR_PROFILE_FIELDS);
    expect(g).toMatchObject({ state: "GRANTED", basis: "NAMED_ON_RECORD" });
    const events = await logged(profileA);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ actorPersonId: p.holder, outcome: "GRANTED", basis: "NAMED_ON_RECORD", entity: "CreditorProfile", sourceAddress: "203.0.113.7" });
    expect(events[0]!.fields).toEqual(expect.arrayContaining(["bankAccountNo", "beneficiaryName"]));
  });

  it("opens to whoever decided a step, and to the officer who checked this version", async () => {
    expect(await sulitGate(staff(p.decider), subject(profileA, supplierA), CREDITOR_PROFILE_FIELDS)).toMatchObject({ state: "GRANTED", basis: "NAMED_ON_RECORD" });
    expect(await sulitGate(staff(p.verifier), subject(profileA, supplierA, p.verifier), CREDITOR_PROFILE_FIELDS)).toMatchObject({ state: "GRANTED", basis: "NAMED_ON_RECORD" });
  });

  it("the verifier of one version is not named on the next: a newer version waits for its own check", async () => {
    const g = await sulitGate(staff(p.verifier), subject(profileA2, supplierA, null), CREDITOR_PROFILE_FIELDS);
    expect(g.state).toBe("WITHHELD");
  });

  it("opens to a role the organisation has granted the right to read creditor profiles, on its own basis", async () => {
    const g = await sulitGate(staff(p.grantee, { permissions: ["sulit.read.creditorProfile"] }), subject(profileB, supplierB), CREDITOR_PROFILE_FIELDS);
    expect(g).toMatchObject({ state: "GRANTED", basis: "CREDITOR_PROFILE_PERMISSION" });
  });

  it("refuses the holder of a step on ANOTHER supplier's route, and says what would open it", async () => {
    const g = await sulitGate(staff(p.otherHolder), subject(profileA2, supplierA), CREDITOR_PROFILE_FIELDS);
    expect(g.state).toBe("WITHHELD");
    if (g.state === "WITHHELD") {
      expect(g.words.en).toMatch(/route|creditor/i);
      expect(JSON.stringify(g)).not.toMatch(/1234567890|Beneficiary/);
    }
    // ...and that person does read the bank details of the supplier whose route they hold.
    expect((await sulitGate(staff(p.otherHolder), subject(profileB, supplierB), CREDITOR_PROFILE_FIELDS)).state).toBe("GRANTED");
  });

  it("refuses a holder or decider on ANOTHER application of the SAME supplier, and logs the refusal: a profile is named by the route of the application it was sent with, not by every route of its supplier", async () => {
    // profileA was sent with the first application, profileA2 with the renewal. The first application's holder and decider have nothing on the renewal's profile...
    for (const person of [p.holder, p.decider]) {
      const before = (await logged(profileA2)).length;
      const g = await sulitGate(staff(person), subject(profileA2, supplierA), CREDITOR_PROFILE_FIELDS);
      expect(g.state, "first application's route, renewal's profile").toBe("WITHHELD");
      const events = (await logged(profileA2)).slice(before);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ actorPersonId: person, outcome: "WITHHELD" });
      expect(JSON.stringify(events)).not.toMatch(/1234567890|Beneficiary/);
    }
    // ...and the renewal's holder has nothing on the first application's profile, though both are the same supplier's.
    expect((await sulitGate(staff(p.secondHolder), subject(profileA, supplierA), CREDITOR_PROFILE_FIELDS)).state).toBe("WITHHELD");
    expect(await sulitGate(staff(p.secondHolder), subject(profileA2, supplierA), CREDITOR_PROFILE_FIELDS)).toMatchObject({ state: "GRANTED", basis: "NAMED_ON_RECORD" });
  });

  it("refuses finance with no grant: the right is undecided until the organisation decides, and the refusal says so", async () => {
    const g = await sulitGate(staff(p.finance), subject(profileA2, supplierA), CREDITOR_PROFILE_FIELDS);
    expect(g.state).toBe("WITHHELD");
    if (g.state === "WITHHELD") expect(g.words.en).toMatch(/not yet decided|undecided|has not/i);
  });

  it("never opens to an administrator account, whatever it holds", async () => {
    const g = await sulitGate(staff(p.admin, { admin: true, permissions: ["sulit.read.creditorProfile"] }), subject(profileA2, supplierA), CREDITOR_PROFILE_FIELDS);
    expect(g.state).toBe("WITHHELD");
    const holderAsAdmin = await sulitGate(staff(p.holder, { admin: true }), subject(profileB, supplierB), CREDITOR_PROFILE_FIELDS);
    expect(holderAsAdmin.state).toBe("WITHHELD");
  });

  it("logs every refusal as it logs a reading, with the reader named and no value in the row", async () => {
    const before = (await logged(profileB)).length;
    await sulitGate(staff(p.finance), subject(profileB, supplierB), CREDITOR_PROFILE_FIELDS);
    await sulitGate(staff(p.admin, { admin: true }), subject(profileB, supplierB), CREDITOR_PROFILE_FIELDS);
    const events = (await logged(profileB)).slice(before);
    expect(events).toHaveLength(2);
    expect(events.map((e) => [e.actorPersonId, e.outcome])).toEqual([[p.finance, "WITHHELD"], [p.admin, "WITHHELD"]]);
    expect(JSON.stringify(events)).not.toMatch(/1234567890|Beneficiary/);
  });

  it("a profile that is not the organisation's is not one anybody is named on", async () => {
    const g = await sulitGate(staff(p.holder), subject("not_a_profile_of_this_org", supplierA), CREDITOR_PROFILE_FIELDS);
    expect(g.state).toBe("WITHHELD");
  });

  it("names the profile's supplier from the profile itself: a caller that pairs it with another supplier's route gains nothing", async () => {
    // profileB belongs to supplier B; asking as if it were A's, whose route this person holds, opens nothing.
    const g = await sulitGate(staff(p.holder), subject(profileB, supplierA), CREDITOR_PROFILE_FIELDS);
    expect(g.state).toBe("WITHHELD");
  });

  it("without a route started, the words say so: a route holder cannot be named before there is a route", async () => {
    const lone = await makeSupplier("C");
    const acc = await account(lone.supplier.id, "c");
    const lonely = await db.creditorProfile.create({ data: { organisationId, supplierId: lone.supplier.id, version: 1, beneficiaryName: "X", enteredBySupplierAccountId: acc.id, submittedAt: new Date() } });
    const g = await sulitGate(staff(p.holder), subject(lonely.id, lone.supplier.id), CREDITOR_PROFILE_FIELDS);
    expect(g.state).toBe("WITHHELD");
    if (g.state === "WITHHELD") expect(g.words.en).toMatch(/No approval route has been started/);
  });
});

describe("a supplier reading its own bank details", () => {
  it("is logged with the supplier's account as the actor, never a person, and with the reading's own basis", async () => {
    const { creditorEventRow, OWN_RECORD, writeSupplierSulitEvent } = await import("@/lib/auth/creditor-access-store");
    const acc = await db.supplierAccount.findFirstOrThrow({ where: { supplierId: supplierA } });
    await writeSupplierSulitEvent(db, { organisationId, accountId: acc.id, sessionId: "ses_supplier", sourceAddress: "198.51.100.4" }, creditorEventRow({ id: profileA, label: "Creditor's profile" }, ["documentBytes"], OWN_RECORD));
    const e = (await logged(profileA)).find((x) => x.actorSupplierAccountId === acc.id)!;
    expect(e).toMatchObject({ actorPersonId: null, actorSystemLabel: null, outcome: "GRANTED", basis: "OWN_RECORD", sourceAddress: "198.51.100.4" });
  });

  it("the log takes one actor and no more: a reading by a person and an account at once is refused by the database", async () => {
    const acc = await db.supplierAccount.findFirstOrThrow({ where: { supplierId: supplierA } });
    await expect(
      db.sulitAccessEvent.create({ data: { organisationId, actorPersonId: p.holder, actorSupplierAccountId: acc.id, scope: "creditorProfile", entity: "CreditorProfile", entityId: profileA, entityLabel: "x", fields: ["bankAccountNo"], outcome: "GRANTED", basis: "OWN_RECORD" } }),
    ).rejects.toThrow();
  });
});
