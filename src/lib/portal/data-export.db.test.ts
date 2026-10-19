import { createHash, randomBytes } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { authenticateSupplier } from "@/lib/auth/supplier-identity";
import { readSupplierSession } from "@/lib/auth/supplier-session-store";
import type { SupplierActor } from "@/lib/auth/types";
import { db } from "@/lib/db";
import { loadSupplier, supplierHistory } from "@/lib/suppliers/repo";
import { ensureAdministrator, facts, makeSupplierAccount, randomId, setPolicy, SUPPLIER_SETTINGS, testOrganisation } from "@/lib/test-db/auth-fixtures";

import { exportSupplierData } from "./data-export-store";
import { portalStandingBarOf } from "./standing-gate-store";

/**
 * N2 step 2 (PDPA right of access, ruling 1875(8); plan docs/notes/plans/backlog-n2.md): a signed-in supplier's export of its own data, against a real database. Supplier A's OUT columns and
 * every row of supplier B carry sentinels; A's export holds none of them, and holds A's own IN values (so "none" is not an empty export passing by default). Each call writes one export row
 * and one audit row, on A's History and not on B's, and logs the SULIT reads as A's own record. A supplier suspended or blacklisted still gets its export (ruling 1875(3)).
 */

const DAY = 24 * 60 * 60 * 1000;
const D = (d: Date) => new Date(`${d.toISOString().slice(0, 10)}T00:00:00.000Z`);
const hex = (n: number) => randomBytes(n).toString("hex");
const newId = (p: string) => `${p}_${randomId()}${randomId()}`;
const RUN = randomId();
const tag = (name: string) => `${name}-${RUN}`;

let org = "";
let officer = "";
let typeId = "";

interface Who {
  actor: SupplierActor;
  supplierId: string;
  accountId: string;
  reference: string;
}

/// A registered supplier with a live account, signed in: the actor is the one the portal reads from the session.
async function signedIn(name: string): Promise<Who> {
  const s = await makeSupplierAccount(org);
  const sup = await db.supplier.update({ where: { id: s.supplier.id }, data: { status: "REGISTERED", registeredOn: D(new Date(Date.now() - 100 * DAY)), registeredName: name } });
  const out = await authenticateSupplier({ loginName: s.loginName, password: s.password }, facts(), null);
  if (!out.ok) throw new Error(`sign-in failed: ${JSON.stringify(out)}`);
  const read = await readSupplierSession(out.token, { sourceAddress: "203.0.113.9" });
  if (!read.ok) throw new Error("session read failed");
  return { actor: read.actor, supplierId: s.supplier.id, accountId: s.account!.id, reference: sup.reference };
}

async function document(who: Who, o: { reference: string; verification: "VERIFIED" | "NOT_IN_ORDER"; verificationNote: string; note: string }) {
  return db.supplierDocument.create({
    data: {
      organisationId: org, supplierId: who.supplierId, typeId, typeLabelSnapshot: "Companies registry certificate", reference: o.reference, issuingAuthority: "An authority", title: "",
      expiresOn: D(new Date(Date.now() + 300 * DAY)), validFrom: D(new Date(Date.now() - 300 * DAY)), lodgedOn: D(new Date(Date.now() - 200 * DAY)), recordedAt: new Date(), recordedBySupplierAccountId: who.accountId,
      verification: o.verification, verifiedOn: D(new Date(Date.now() - 199 * DAY)), verifiedAt: new Date(), verifiedByPersonId: officer, verificationNote: o.verificationNote, note: o.note,
    },
  });
}

/// A standing event as the office records it (StandingEvent_shape): a reason from the list, and a blacklisting from its request.
async function standing(who: Who, kind: "SUSPEND" | "BLACKLIST", o: { reason: string; note: string }) {
  const reasonId = (await db.standingReason.create({ data: { organisationId: org, code: `N2_${randomId()}`, nameEn: o.reason, appliesTo: kind } })).id;
  const requestId =
    kind === "BLACKLIST" ? (await db.standingRequest.create({ data: { organisationId: org, supplierId: who.supplierId, kind: "BLACKLIST", reasonId, reasonSnapshot: o.reason, note: o.note, requestedByPersonId: officer, requestedAt: new Date() } })).id : null;
  return db.standingEvent.create({
    data: {
      organisationId: org, supplierId: who.supplierId, kind, reasonId, requestId, reasonSnapshot: o.reason, effectiveOn: D(new Date(Date.now() - DAY)), flaggedDocumentIds: [], note: o.note, checklist: { said: o.note }, recordedByPersonId: officer, recordedAt: new Date(),
      ...(kind === "BLACKLIST" ? { offenceNo: 1, periodMonths: 12, endsOn: D(new Date(Date.now() + 360 * DAY)) } : {}),
    },
  });
}

const bank = (who: Who, beneficiaryName: string) =>
  db.creditorProfile.create({ data: { organisationId: org, supplierId: who.supplierId, version: 1, beneficiaryName, bankCode: "n2_bank", bankAccountNo: "1234567890", bankAccountTypeCode: "n2_current", enteredBySupplierAccountId: who.accountId, submittedAt: new Date(Date.now() - 50 * DAY) } });

async function application(who: Who, remarks: string, policy: string) {
  const app = await db.supplierApplication.create({ data: { organisationId: org, supplierId: who.supplierId, kind: "NEW", receivedOn: D(new Date(Date.now() - 120 * DAY)), channel: "COUNTER", recordedByPersonId: officer, recordedAt: new Date(), status: "REJECTED" } });
  await db.applicationDecision.create({ data: { organisationId: org, applicationId: app.id, outcome: "REJECT", remarks, decidedByPersonId: officer, decidedOn: D(new Date(Date.now() - 110 * DAY)), decidedAt: new Date(), policySnapshot: { said: policy } } });
}

/// A published, advertised ONLINE exercise with its exercise key (and the officers' keys and shares it needs), one party per supplier, and one online bid per supplier.
async function exerciseWithBids(bids: { who: Who; manifest: Buffer; receiptDigest: string }[]) {
  const requisitionId = (
    await db.requisition.create({
      data: { organisationId: org, reference: `N2/REQ/${randomId()}`, requestingUnitCode: "D", requestingPersonId: officer, title: "R", justification: "t", needStatement: "t", costCentreCode: "C", accountCode: "A", placeOfDelivery: "x", dateRequired: new Date("2027-01-01"), estimatedValue: "1000.00", raisedOn: new Date("2026-10-01") },
    })
  ).id;
  const ex = await db.sourcingExercise.create({
    data: { organisationId: org, reference: `N2/EX/${randomId()}`, requisitionId, title: "Export test exercise", estimatedValue: "1000.00", sourcingMethodCode: "N2_METHOD", status: "DOCUMENTS_IN_PREPARATION", closingAt: new Date(Date.now() + DAY), submissionChannel: "ONLINE", onlineSubmissionMode: "DEMONSTRATION" },
  });
  await db.exerciseWindow.create({
    data: {
      organisationId: org, exerciseId: ex.id, path: "ADVERTISED", publishedAt: new Date(Date.now() - 2 * DAY), advertisementDay: D(new Date(Date.now() - 2 * DAY)), policySnapshot: { attendance: { mandatoryPermitted: true } },
      purchaseFromDay: D(new Date(Date.now() - DAY)), purchaseCloseDay: D(new Date(Date.now() + 10 * DAY)), feeAmount: "50.00", alternativesPermitted: true,
    },
  });
  const people = [(await db.person.create({ data: { organisationId: org, name: `Officer A ${randomId()}` } })).id, (await db.person.create({ data: { organisationId: org, name: `Officer B ${randomId()}` } })).id];
  const roster: string[] = [];
  for (const personId of people) roster.push((await db.exerciseOpeningOfficer.create({ data: { organisationId: org, exerciseId: ex.id, personId, seatLabelSnapshot: "Member", namedAt: new Date(), namedByPersonId: officer } })).id);
  const keyId = newId("key");
  await db.$transaction(async (tx) => {
    const officerKeys: string[] = [];
    for (let i = 0; i < people.length; i++) {
      const id = newId("ok");
      officerKeys.push(id);
      await tx.$executeRawUnsafe(
        `INSERT INTO "OfficerExerciseKey" ("id","organisationId","exerciseId","openingOfficerId","personId","publicKey","wrappedPrivateKey","kdfLog2N","kdfR","kdfP","kdfSalt","createdAt") VALUES ($1,$2,$3,$4,$5,decode($6,'hex'),decode($7,'hex'),17,8,1,decode($8,'hex'),"sealed_clock"())`,
        id, org, ex.id, roster[i], people[i], hex(32), hex(60), hex(16),
      );
    }
    await tx.$executeRawUnsafe(`INSERT INTO "ExerciseSealingKey" ("id","organisationId","exerciseId","publicKey","fingerprint","officerCount","createdAt") VALUES ($1,$2,$3,decode($4,'hex'),$5,2,"sealed_clock"())`, keyId, org, ex.id, hex(32), hex(32));
    for (let i = 0; i < people.length; i++) {
      await tx.$executeRawUnsafe(`INSERT INTO "ExerciseKeyShare" ("id","organisationId","keyId","openingOfficerId","officerKeyId","sealedShare","createdAt") VALUES ($1,$2,$3,$4,$5,decode($6,'hex'),"sealed_clock"())`, newId("sh"), org, keyId, roster[i], officerKeys[i], hex(80));
    }
  });
  await db.sourcingExercise.update({ where: { id: ex.id }, data: { status: "ADVERTISED" } });
  let sequence = 0;
  for (const b of bids) {
    await db.exerciseParty.create({ data: { organisationId: org, exerciseId: ex.id, source: "PURCHASER", name: `Party ${randomId()}`, registrationNo: `RN-${randomId()}`, vendorId: b.who.supplierId } });
    sequence += 1;
    await db.$transaction(async (tx) => {
      const envelopeId = newId("env");
      await tx.$executeRawUnsafe(
        `INSERT INTO "BidEnvelope" ("id","organisationId","exerciseId","sequence","kind","channel","receivedAt","receivedSource","markings","late","recordedAfterClosing") VALUES ($1,$2,$3,$4,'BID','ONLINE',date_trunc('second',"sealed_clock"()),'PORTAL','',false,false)`,
        envelopeId, org, ex.id, sequence,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "OnlineBid" ("id","organisationId","exerciseId","keyId","envelopeId","supplierId","submittedBySupplierAccountId","kind","sealedManifest","manifestDek","manifestCipherSha256","sealedDeclaration","declarationDek","declarationCipherSha256","receiptDigest")
         VALUES ($1,$2,$3,$4,$5,$6,$7,'BID',decode($8,'hex'),decode($9,'hex'),$10,decode($11,'hex'),decode($12,'hex'),$13,$14)`,
        newId("bid"), org, ex.id, keyId, envelopeId, b.who.supplierId, b.who.accountId, b.manifest.toString("hex"), hex(80), hex(32), b.manifest.toString("hex"), hex(80), hex(32), b.receiptDigest,
      );
    });
  }
}

// --- the two suppliers ------------------------------------------------------------------------------------------------------------------------

let A: Who;
let B: Who;
/// A's own values the export must carry: the positive controls.
const A_IN = { docReference: tag("A-DOC-REF"), notInOrderNote: tag("A-NOT-IN-ORDER-NOTE"), reason: tag("A-STANDING-REASON"), beneficiary: tag("A-BENEFICIARY"), remarks: tag("A-REMARKS"), receiptDigest: hex(32) };
/// A's OUT columns.
const A_OUT = {
  docNote: tag("A-OUT-DOCUMENT-NOTE"),
  verifiedNote: tag("A-OUT-VERIFIED-NOTE"),
  standingNote: tag("A-OUT-STANDING-NOTE"),
  erp: tag("A-OUT-ERP"),
  passwordHash: tag("A-OUT-PASSWORD-HASH"),
  // The key is the sign-in name lower-cased (SupplierAccount_login_key_lower): the name is set in capitals below, so the key differs from what is shown.
  loginKey: tag("a-out-login-key"),
  policy: tag("A-OUT-POLICY"),
  sealed: tag("A-OUT-SEALED-MANIFEST"),
};
const A_LOGIN_NAME = A_OUT.loginKey.toUpperCase();
/// Every row of B carries this.
const B_MARK = tag("B-SENTINEL");
const B_DIGEST = hex(32);

function holdsNone(text: string, sentinels: readonly string[]) {
  for (const s of sentinels) expect(text.includes(s), s).toBe(false);
}

beforeAll(async () => {
  org = (await testOrganisation()).id;
  await setPolicy(org, SUPPLIER_SETTINGS);
  await ensureAdministrator(org);
  officer = (await db.person.create({ data: { organisationId: org, name: `Officer ${randomId()}` } })).id;
  // Not mandatory, and retired after: the scratch organisation is shared, and another file's registration is never asked for this type.
  typeId = (await db.supplierDocumentType.upsert({ where: { organisationId_code: { organisationId: org, code: "n2_reg" } }, update: { retiredOn: null }, create: { organisationId: org, code: "n2_reg", nameEn: "Companies registry certificate", provenance: "ASSUMED", expires: true, mandatoryAtRegistration: false, notApplicableAllowed: false } })).id;
  for (const [code, list, nameEn] of [["n2_bank", "BANK", "Demonstration Bank"], ["n2_current", "ACCOUNT_TYPE", "Current account"]] as const) {
    await db.supplierListValue.upsert({ where: { organisationId_list_code: { organisationId: org, list, code } }, update: {}, create: { organisationId: org, list, code, nameEn, provenance: "ASSUMED" } });
  }

  A = await signedIn(tag("A Company"));
  B = await signedIn(B_MARK);

  // A: its IN values, and a sentinel in each OUT column the plan names.
  await document(A, { reference: A_IN.docReference, verification: "VERIFIED", verificationNote: A_OUT.verifiedNote, note: A_OUT.docNote });
  await document(A, { reference: tag("A-DOC-REF-2"), verification: "NOT_IN_ORDER", verificationNote: A_IN.notInOrderNote, note: A_OUT.docNote });
  await standing(A, "SUSPEND", { reason: A_IN.reason, note: A_OUT.standingNote });
  await bank(A, A_IN.beneficiary);
  await application(A, A_IN.remarks, A_OUT.policy);
  await db.supplier.update({ where: { id: A.supplierId }, data: { erpVendorCode: A_OUT.erp } });
  // After the sign-in: the session read is done, and the export never reads these.
  await db.supplierAccount.update({ where: { id: A.accountId }, data: { passwordHash: A_OUT.passwordHash, loginName: A_LOGIN_NAME, loginKey: A_OUT.loginKey } });

  // B: every row it has carries its sentinel.
  await db.supplierContact.updateMany({ where: { supplierId: B.supplierId }, data: { name: B_MARK, designation: B_MARK } });
  await document(B, { reference: B_MARK, verification: "NOT_IN_ORDER", verificationNote: B_MARK, note: B_MARK });
  await standing(B, "SUSPEND", { reason: B_MARK, note: B_MARK });
  await bank(B, B_MARK);
  await application(B, B_MARK, B_MARK);
  await db.supplier.update({ where: { id: B.supplierId }, data: { erpVendorCode: B_MARK, companyEmail: `${B_MARK}@example.test`, registeredAddress: B_MARK } });

  await exerciseWithBids([
    { who: A, manifest: Buffer.from(A_OUT.sealed, "utf8"), receiptDigest: A_IN.receiptDigest },
    { who: B, manifest: Buffer.from(B_MARK, "utf8"), receiptDigest: B_DIGEST },
  ]);
});

afterAll(async () => {
  await db.supplierDocumentType.updateMany({ where: { organisationId: org, code: "n2_reg" }, data: { retiredOn: new Date("2000-01-01T00:00:00Z") } });
});

const exportsOf = (who: Who) => db.supplierDataExport.count({ where: { supplierId: who.supplierId } });
const auditsOf = (who: Who) => db.auditEntry.findMany({ where: { organisationId: org, entity: "SupplierDataExport", entityLabel: `${who.reference} · Data export` }, orderBy: { at: "asc" } });

describe("a supplier's export of its own data (N2)", () => {
  it("holds A's own values and none of A's OUT columns or B's rows, in the file and in its audit row", async () => {
    const start = new Date();
    const out = await exportSupplierData(A.actor, "FILE");
    expect(out).not.toBeNull();
    const { json, export: e } = out!;

    // Positive controls: the sections the sentinels live in are not empty.
    const counts = Object.fromEntries(e.sections.map((s) => [s.key, s.rows.length]));
    expect(counts).toMatchObject({ company: 1, contacts: 1, accounts: 1, documents: 2, bank: 1, standing: 1, standingChanges: 1, applications: 1, bidReceipts: 1 });
    for (const v of Object.values(A_IN)) expect(json, v).toContain(v);
    expect(json).toContain(A_LOGIN_NAME);

    const sealed = Buffer.from(A_OUT.sealed, "utf8");
    const bAccount = await db.supplierAccount.findUniqueOrThrow({ where: { id: B.accountId }, select: { loginName: true, contact: { select: { email: true } } } });
    holdsNone(json, [...Object.values(A_OUT), sealed.toString("hex"), sealed.toString("base64"), B_MARK, B_DIGEST, B.reference, bAccount.loginName, bAccount.contact.email]);
    expect(json).not.toContain('"Buffer"');

    // One export row, its digest the file's bytes', and one audit row with no exported value.
    const rows = await db.supplierDataExport.findMany({ where: { supplierId: A.supplierId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ organisationId: org, accountId: A.accountId, sessionId: A.actor.sessionId, form: "FILE", sha256: createHash("sha256").update(Buffer.from(json, "utf8")).digest("hex") });
    expect(rows[0].sectionCounts).toEqual(counts);
    const audits = await auditsOf(A);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ entityId: rows[0].id, action: "CREATE", actorSupplierAccountId: A.accountId });
    const changes = JSON.stringify(audits[0].changes);
    holdsNone(changes, [...Object.values(A_OUT), ...Object.values(A_IN), A_LOGIN_NAME, B_MARK]);
    expect(changes).toContain(rows[0].sha256!);

    // The SULIT reads, as A's own record: the bank version (as the bank tab writes it) and the contacts.
    const events = await db.sulitAccessEvent.findMany({ where: { actorSupplierAccountId: A.accountId, at: { gte: start } } });
    expect(events.map((x) => `${x.entity}:${x.outcome}:${x.basis}`).sort()).toEqual(["CreditorProfile:GRANTED:OWN_RECORD", "Supplier:GRANTED:OWN_RECORD"]);
  });

  it("writes one export row and one audit row per call, on A's History and not on B's", async () => {
    const [rowsBefore, auditsBefore] = [await exportsOf(A), (await auditsOf(A)).length];
    const page = await exportSupplierData(A.actor, "PAGE");
    expect(page).not.toBeNull();
    expect(await exportsOf(A)).toBe(rowsBefore + 1);
    const audits = await auditsOf(A);
    expect(audits).toHaveLength(auditsBefore + 1);
    const last = await db.supplierDataExport.findFirstOrThrow({ where: { supplierId: A.supplierId, form: "PAGE" } });
    expect(last.sha256).toBeNull();

    const bOut = await exportSupplierData(B.actor, "FILE");
    expect(bOut).not.toBeNull();
    holdsNone(bOut!.json, [...Object.values(A_IN), A.reference]);
    expect(await exportsOf(B)).toBe(1);

    const history = async (who: Who) => (await supplierHistory((await loadSupplier(org, who.supplierId, []))!)).entries.filter((x) => x.entity === "SupplierDataExport").map((x) => x.id);
    const aHistory = await history(A);
    const bHistory = await history(B);
    for (const a of audits) {
      expect(aHistory).toContain(a.id);
      expect(bHistory).not.toContain(a.id);
    }
    const bAudits = await auditsOf(B);
    expect(bAudits).toHaveLength(1);
    expect(bHistory).toEqual([bAudits[0].id]);
    expect(aHistory).not.toContain(bAudits[0].id);
  });

  it("is not barred by standing (ruling 1875(3)): a suspended and a blacklisted supplier each get theirs", async () => {
    // A is suspended (above). C is blacklisted.
    const C = await signedIn(tag("C Company"));
    await standing(C, "BLACKLIST", { reason: tag("C-REASON"), note: tag("C-OUT-NOTE") });
    for (const who of [A, C]) {
      // The seeding bars them: every act but reading is refused (the standing gate), so the export below is a read a barred supplier keeps.
      expect(await db.$transaction((tx) => portalStandingBarOf(tx, who.actor, "TRANSACT")), who.reference).not.toBeNull();
      const before = await exportsOf(who);
      const out = await exportSupplierData(who.actor, "PAGE");
      expect(out, who.reference).not.toBeNull();
      expect(out!.export.sections.find((s) => s.key === "standing")!.rows).toHaveLength(1);
      expect(await exportsOf(who)).toBe(before + 1);
    }
    const c = await exportSupplierData(C.actor, "FILE");
    expect(c!.json).toContain(tag("C-REASON"));
    expect(c!.json).not.toContain(tag("C-OUT-NOTE"));
  });
});
