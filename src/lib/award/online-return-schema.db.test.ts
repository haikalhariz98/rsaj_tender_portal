import { createHash, randomBytes } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import { db, type Tx } from "@/lib/db";
import { STAFF_NOTICE_KINDS } from "@/lib/inbox/kinds";
import { makePerson, makeSupplierAccount, randomId, testOrganisation } from "@/lib/test-db/auth-fixtures";
import { applyAppRole } from "../../../scripts/db-role-apply";

/**
 * What the database itself holds of wave V (ADR 0045, plan step V1), against migrations 20261201000000_wave_v_enums and 20261201000100_wave_v_tables. The acts
 * (steps V2 to V8) judge first; these are the backstops, for every login. Each refusal is told apart by its SQLSTATE: PA001 the trail's append-only refusal,
 * PA048 to PA051 the wave's own triggers, PA043, PA044 and PA047 the Project workspace's, 23514 a CHECK, 23505 a unique key, 42501 a grant the app role lacks.
 * The writes the acts will make run as the app's role (`perolehan_app_test`, given exactly the grants `db:roles` gives), so the grants are proved with them.
 */

const TEST_ROLE = "perolehan_app_test";
const DAY = new Date("2026-10-24T00:00:00.000Z");
const now = () => new Date();

let organisationId = "";
let otherOrganisationId = "";
let officer = "";
let awardeeAccount = "";
let awardeeSupplier = "";
let strangerAccount = "";
let exerciseId = "";
let documentClassId = "";

function sqlState(error: unknown): string {
  const e = error as { code?: string; meta?: { driverAdapterError?: { cause?: { originalCode?: string; code?: string; kind?: string } } } };
  const cause = e.meta?.driverAdapterError?.cause;
  if (cause?.originalCode) return cause.originalCode;
  if (e.code === "P2002") return "23505";
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

/// Runs the write as the app's role; null when it is accepted, else its SQLSTATE. A refused write rolls back with its transaction.
async function asApp(fn: (tx: Tx) => Promise<unknown>): Promise<string | null> {
  try {
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL ROLE ${TEST_ROLE}`);
      await fn(tx);
    });
    return null;
  } catch (error) {
    return sqlState(error);
  }
}

/// Runs the work with foreign keys off (replication role), in a transaction that is always rolled back: the CHECKs, the unique indexes and every ENABLE ALWAYS
/// trigger still hold. Null when the work went through, else its SQLSTATE.
async function inRolledBack(fn: (tx: Tx) => Promise<unknown>): Promise<string | null> {
  const ROLLBACK = new Error("rolled back on purpose");
  try {
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL session_replication_role = replica`);
      await fn(tx);
      throw ROLLBACK;
    });
  } catch (e) {
    return e === ROLLBACK ? null : sqlState(e);
  }
  return "not rolled back";
}

beforeAll(async () => {
  expect((await db.$transaction((tx) => applyAppRole(tx, { role: TEST_ROLE, password: null }))).ok).toBe(true);
  organisationId = (await testOrganisation()).id;
  otherOrganisationId = (await db.organisation.create({ data: { code: `WV_${randomId()}`, name: "Another organisation", timeZone: "Asia/Kuala_Lumpur" } })).id;
  officer = (await makePerson(organisationId, `Officer ${randomId()}`)).id;
  const awardee = await makeSupplierAccount(organisationId);
  awardeeAccount = awardee.account!.id;
  awardeeSupplier = awardee.supplier.id;
  strangerAccount = (await makeSupplierAccount(organisationId)).account!.id;
  const run = randomId();
  const requisition = await db.requisition.create({
    data: { organisationId, reference: `WV/RQ/${run}`, requestingUnitCode: "WV_DEPT", requestingPersonId: officer, title: "Wave V requisition", justification: "Tests.", needStatement: "None.", costCentreCode: "WV_CC", accountCode: "WV_AC", placeOfDelivery: "Nowhere", dateRequired: DAY, estimatedValue: "100000.00", raisedOn: DAY },
  });
  exerciseId = (await db.sourcingExercise.create({ data: { organisationId, reference: `WV/EX/${run}`, requisitionId: requisition.id, title: `Supply ${run}`, estimatedValue: "100000.00", sourcingMethodCode: "WV_METHOD", status: "EVALUATED" } })).id;
  documentClassId = (await db.documentClass.create({ data: { organisationId, code: `wv_${randomId()}`, nameEn: "Wave V class", classification: "INTERNAL" } })).id;
});

/// A fresh issued award to the awardee (each test its own, so the one-waiting index never meets another test's row).
async function award(): Promise<string> {
  return (
    await db.award.create({
      data: { organisationId, reference: `WV/AW/${randomId()}`, exerciseId, instrumentKind: "WORK_INDENT", awardeeName: "A Contractor", awardedValue: "100000.00", completionPeriod: 90, completionUnit: "DAYS", status: "ISSUED", vendorId: awardeeSupplier },
    })
  ).id;
}

const PAGE = { signatoryName: "Ahmad bin Ali", icNumber: "800101-01-1234", occupation: "Director", address: "1 Jalan Satu", capacity: "Director", witnessName: "Siti", contractorSigned: true, stampAffixed: true, witnessSigned: true };

const lodge = (tx: Tx | typeof db, awardId: string, extra: Record<string, unknown> = {}) =>
  tx.awardOnlineReturn.create({ data: { organisationId, awardId, submittedBySupplierAccountId: awardeeAccount, submittedAt: now(), submittedOn: DAY, stepUpAt: now(), ...extra } });
const verify = (tx: Tx | typeof db, id: string) => tx.awardOnlineReturn.update({ where: { id }, data: { verifiedByPersonId: officer, verifiedAt: now() } });
const refuse = (tx: Tx | typeof db, id: string, refusedReason = "The declaration is not signed.") => tx.awardOnlineReturn.update({ where: { id }, data: { refusedByPersonId: officer, refusedAt: now(), refusedReason } });

describe("an online award return is lodged by the awardee, kept as sent, and decided once (PA048)", () => {
  it("is lodged undecided by an account of the awardee, as the app role, with or without the acceptance page", async () => {
    const a = await award();
    expect(await asApp((tx) => lodge(tx, a))).toBeNull();
    const b = await award();
    expect(await asApp((tx) => lodge(tx, b, PAGE))).toBeNull();
  });

  it("refuses a return lodged by another supplier's account, in another organisation, or already decided", async () => {
    const a = await award();
    expect(await refusal(lodge(db, a, { submittedBySupplierAccountId: strangerAccount }))).toBe("PA048");
    expect(await refusal(lodge(db, a, { organisationId: otherOrganisationId }))).toBe("PA048");
    expect(await refusal(lodge(db, a, { verifiedByPersonId: officer, verifiedAt: now() }))).toBe("PA048");
    expect(await refusal(lodge(db, a, { refusedByPersonId: officer, refusedAt: now(), refusedReason: "No." }))).toBe("PA048");
  });

  it("takes the acceptance page whole or not at all, every attestation true (CHECK)", async () => {
    const a = await award();
    expect(await refusal(lodge(db, a, { signatoryName: "Ahmad bin Ali" }))).toBe("23514");
    expect(await refusal(lodge(db, a, { ...PAGE, capacity: " " }))).toBe("23514");
    expect(await refusal(lodge(db, a, { ...PAGE, stampAffixed: false }))).toBe("23514");
    expect(await refusal(lodge(db, a, { ...PAGE, witnessSigned: null }))).toBe("23514");
    expect(await refusal(lodge(db, a, { contractorSigned: true }))).toBe("23514");
  });

  it("holds one undecided return per award (partial unique index), and a new one may follow a refusal", async () => {
    const a = await award();
    const first = await lodge(db, a);
    expect(await refusal(lodge(db, a))).toBe("23505");
    expect(await asApp((tx) => refuse(tx, first.id))).toBeNull();
    const second = await lodge(db, a);
    expect(await asApp((tx) => verify(tx, second.id))).toBeNull();
    expect(await refusal(lodge(db, a))).toBeNull();
  });

  it("refuses a change to anything but the decision, a second decision, and a decision half made (trigger and CHECKs)", async () => {
    const a = await award();
    const r = await lodge(db, a, PAGE);
    expect(await refusal(db.awardOnlineReturn.update({ where: { id: r.id }, data: { icNumber: "900101-01-0000" } }))).toBe("PA048");
    expect(await refusal(db.awardOnlineReturn.update({ where: { id: r.id }, data: { verifiedByPersonId: officer, verifiedAt: now(), icNumber: "900101-01-0000" } }))).toBe("PA048");
    expect(await refusal(db.awardOnlineReturn.update({ where: { id: r.id }, data: { verifiedAt: now() } }))).toBe("23514");
    expect(await refusal(db.awardOnlineReturn.update({ where: { id: r.id }, data: { refusedByPersonId: officer, refusedAt: now(), refusedReason: "  " } }))).toBe("23514");
    expect(await refusal(db.awardOnlineReturn.update({ where: { id: r.id }, data: { verifiedByPersonId: officer, verifiedAt: now(), refusedReason: "Why" } }))).toBe("23514");
    expect(await refusal(db.awardOnlineReturn.update({ where: { id: r.id }, data: { verifiedByPersonId: officer, verifiedAt: now(), refusedByPersonId: officer, refusedAt: now(), refusedReason: "Both" } }))).toBe("23514");
    expect(await asApp((tx) => verify(tx, r.id))).toBeNull();
    expect(await refusal(refuse(db, r.id))).toBe("PA048");
    expect(await refusal(verify(db, r.id))).toBe("PA048");
    expect(await refusal(db.awardOnlineReturn.update({ where: { id: r.id }, data: { capacity: "Partner" } }))).toBe("PA048");
  });

  it("is never removed: DELETE is refused for every login (PA048), the app role has no DELETE or TRUNCATE, and TRUNCATE is refused (PA001)", async () => {
    const r = await lodge(db, await award());
    expect(await refusal(db.awardOnlineReturn.delete({ where: { id: r.id } }))).toBe("PA048");
    expect(await asApp((tx) => tx.awardOnlineReturn.delete({ where: { id: r.id } }))).toBe("42501");
    expect(await refusal(db.$executeRawUnsafe(`TRUNCATE "AwardOnlineReturn" CASCADE`))).toBe("PA001");
  });
});

describe("a question on an award is asked by the awardee and answered once (PA049)", () => {
  const ask = (tx: Tx | typeof db, awardId: string, extra: Record<string, unknown> = {}) =>
    tx.awardQuery.create({ data: { organisationId, awardId, body: "Which site office do we report to?", askedBySupplierAccountId: awardeeAccount, askedAt: now(), ...extra } });

  it("is asked by an account of the awardee as the app role, within 1 to 2000 characters, unanswered", async () => {
    const a = await award();
    expect(await asApp((tx) => ask(tx, a))).toBeNull();
    expect(await refusal(ask(db, a, { body: "x".repeat(2000) }))).toBeNull();
    expect(await refusal(ask(db, a, { body: "x".repeat(2001) }))).toBe("23514");
    expect(await refusal(ask(db, a, { body: "   " }))).toBe("23514");
    expect(await refusal(ask(db, a, { askedBySupplierAccountId: strangerAccount }))).toBe("PA049");
    expect(await refusal(ask(db, a, { organisationId: otherOrganisationId }))).toBe("PA049");
    expect(await refusal(ask(db, a, { answer: "Already", answeredByPersonId: officer, answeredAt: now() }))).toBe("PA049");
  });

  it("is answered once, whole, and nothing else about it changes; it is never removed", async () => {
    const q = await ask(db, await award());
    expect(await refusal(db.awardQuery.update({ where: { id: q.id }, data: { body: "Changed" } }))).toBe("PA049");
    expect(await refusal(db.awardQuery.update({ where: { id: q.id }, data: { answeredAt: now(), answeredByPersonId: officer } }))).toBe("23514");
    expect(await refusal(db.awardQuery.update({ where: { id: q.id }, data: { answer: "Site office B.", answeredAt: now() } }))).toBe("23514");
    expect(await refusal(db.awardQuery.update({ where: { id: q.id }, data: { answer: "x".repeat(2001), answeredByPersonId: officer, answeredAt: now() } }))).toBe("23514");
    expect(await asApp((tx) => tx.awardQuery.update({ where: { id: q.id }, data: { answer: "Site office B.", answeredByPersonId: officer, answeredAt: now() } }))).toBeNull();
    expect(await refusal(db.awardQuery.update({ where: { id: q.id }, data: { answer: "Site office C.", answeredByPersonId: officer, answeredAt: now() } }))).toBe("PA049");
    expect(await refusal(db.awardQuery.delete({ where: { id: q.id } }))).toBe("PA049");
    expect(await asApp((tx) => tx.awardQuery.delete({ where: { id: q.id } }))).toBe("42501");
    expect(await refusal(db.$executeRawUnsafe(`TRUNCATE "AwardQuery" CASCADE`))).toBe("PA001");
  });
});

/// An active contract on a fresh award to the awardee, with a contractor document of `kind` and its Version 1.
async function claim(kind: "SUPPLY_CLAIM" | "INTERIM_CLAIM") {
  const a = await award();
  const contractId = (await db.contract.create({ data: { organisationId, number: `WV/CON/${randomId()}`, numberSource: "SERIES", numberedOn: DAY, awardId: a, contractSum: "100000.00", status: "ACTIVE" } })).id;
  const d = await db.projectDocument.create({ data: { organisationId, contractId, title: "INV-0001", side: "CONTRACTOR", kind, createdBySupplierAccountId: awardeeAccount, createdAt: now() } });
  const v = await db.projectDocumentVersion.create({ data: { organisationId, documentId: d.id, number: 1, uploadedBySupplierAccountId: awardeeAccount, uploadedAt: now(), uploadedOn: DAY, noApproversAtUpload: true } });
  return { contractId, documentId: d.id, versionId: v.id };
}
const mark = (versionId: string, outcome: "TAKEN_UP" | "RETURNED" | "APPROVED", remarks = "") =>
  db.projectDocumentDecision.create({ data: { organisationId, versionId, outcome, remarks, decidedByPersonId: officer, decidedAt: now(), decidedOn: DAY } });

describe("the seventh kind takes the ADR 0042 triggers as the other kinds do (checked, not assumed)", () => {
  it("a supply claim's version is taken up or returned with remarks, never approved, and takes no approver", async () => {
    const c = await claim("SUPPLY_CLAIM");
    expect(await refusal(mark(c.versionId, "APPROVED"))).toBe("PA044");
    expect(await refusal(db.projectDocumentApprover.create({ data: { organisationId, documentId: c.documentId, personId: officer, addedByPersonId: officer, addedAt: now() } }))).toBe("PA043");
    expect(await refusal(mark(c.versionId, "RETURNED"))).toBe("23514");
    expect(await refusal(mark(c.versionId, "TAKEN_UP"))).toBeNull();
    const r = await claim("SUPPLY_CLAIM");
    expect(await refusal(mark(r.versionId, "RETURNED", "The invoice is not signed."))).toBeNull();
  });

  it("the legacy ContractorSubmission refuses the seventh kind (CHECK)", async () => {
    const c = await claim("SUPPLY_CLAIM");
    const send = (kind: "SUPPLY_CLAIM" | "WORK_PROGRAMME") =>
      db.contractorSubmission.create({ data: { organisationId, contractId: c.contractId, supplierId: awardeeSupplier, kind, title: "Sent", body: "Sent.", submittedBySupplierAccountId: awardeeAccount, submittedAt: now(), submittedOn: DAY } });
    expect(await refusal(send("SUPPLY_CLAIM"))).toBe("23514");
    expect(await inRolledBack((tx) => tx.contractorSubmission.create({ data: { organisationId, contractId: c.contractId, supplierId: awardeeSupplier, kind: "WORK_PROGRAMME", title: "Sent", body: "Sent.", submittedBySupplierAccountId: awardeeAccount, submittedAt: now(), submittedOn: DAY } }))).toBeNull();
  });
});

describe("Finance's payment of a supply claim is recorded once against a verified claim, and never changed (PA050, PA001)", () => {
  const pay = (tx: Tx | typeof db, c: { contractId: string; documentId: string; versionId: string }, extra: Record<string, unknown> = {}) =>
    tx.supplyInvoicePayment.create({ data: { organisationId, contractId: c.contractId, documentId: c.documentId, versionId: c.versionId, paidOn: DAY, batchNo: "B-0001", amount: "1234.50", personId: officer, recordedAt: now(), ...extra } });

  it("is recorded as the app role against a verified supply claim, once", async () => {
    const c = await claim("SUPPLY_CLAIM");
    await mark(c.versionId, "TAKEN_UP");
    expect(await asApp((tx) => pay(tx, c))).toBeNull();
    expect(await refusal(pay(db, c))).toBe("23505");
  });

  it("refuses a claim not verified, returned, of another kind, of another contract, or a version of another claim", async () => {
    const notYet = await claim("SUPPLY_CLAIM");
    expect(await refusal(pay(db, notYet))).toBe("PA050");
    const returned = await claim("SUPPLY_CLAIM");
    await mark(returned.versionId, "RETURNED", "The delivery order is missing.");
    expect(await refusal(pay(db, returned))).toBe("PA050");
    const interim = await claim("INTERIM_CLAIM");
    await mark(interim.versionId, "TAKEN_UP");
    expect(await refusal(pay(db, interim))).toBe("PA050");
    const ok = await claim("SUPPLY_CLAIM");
    await mark(ok.versionId, "TAKEN_UP");
    expect(await refusal(pay(db, ok, { contractId: interim.contractId }))).toBe("PA050");
    expect(await refusal(pay(db, ok, { versionId: interim.versionId }))).toBe("PA050");
    expect(await refusal(pay(db, ok, { organisationId: otherOrganisationId }))).toBe("PA050");
  });

  it("needs a batch number and an amount above nothing (CHECK)", async () => {
    const c = await claim("SUPPLY_CLAIM");
    await mark(c.versionId, "TAKEN_UP");
    expect(await refusal(pay(db, c, { batchNo: "  " }))).toBe("23514");
    expect(await refusal(pay(db, c, { amount: "0.00" }))).toBe("23514");
    expect(await refusal(pay(db, c, { amount: "-1.00" }))).toBe("23514");
  });

  it("is never updated or deleted: PA001 for every login, and the app role has no UPDATE, DELETE or TRUNCATE", async () => {
    const c = await claim("SUPPLY_CLAIM");
    await mark(c.versionId, "TAKEN_UP");
    const p = await pay(db, c);
    expect(await refusal(db.supplyInvoicePayment.update({ where: { id: p.id }, data: { batchNo: "B-0002" } }))).toBe("PA001");
    expect(await refusal(db.supplyInvoicePayment.delete({ where: { id: p.id } }))).toBe("PA001");
    expect(await asApp((tx) => tx.supplyInvoicePayment.update({ where: { id: p.id }, data: { batchNo: "B-0002" } }))).toBe("42501");
    expect(await refusal(db.$executeRawUnsafe(`TRUNCATE "SupplyInvoicePayment" CASCADE`))).toBe("PA001");
  });
});

describe("the attachment CHECKs take the new owner and the two new purposes, each only on its own (replaced whole)", () => {
  const attach = (tx: Tx, purpose: string, owners: Record<string, string>, versionId = `wv_ver_${randomId()}`) =>
    tx.$executeRawUnsafe(
      `INSERT INTO "DocumentAttachment" ("id", "organisationId", "purpose", "versionId", ${Object.keys(owners).map((k) => `"${k}"`).join(", ")}) VALUES ($1, $2, $3::"AttachmentPurpose", $4, ${Object.keys(owners).map((_, i) => `$${i + 5}`).join(", ")})`,
      `wv_att_${randomId()}`,
      organisationId,
      purpose,
      versionId,
      ...Object.values(owners),
    );

  it("an online return takes the four return purposes, a project version the supply claim's two beside its own", async () => {
    for (const p of ["SIGNED_LETTER", "DECLARATION", "AUTHORISATION", "ACCEPTANCE_PAGE"]) {
      expect(await inRolledBack((tx) => attach(tx, p, { awardOnlineReturnId: "wv_r" })), p).toBeNull();
      expect(await inRolledBack((tx) => attach(tx, p, { awardId: "wv_a" })), p).toBeNull();
    }
    for (const p of ["DELIVERY_ORDER", "SUPPLY_INVOICE", "PROJECT_DOCUMENT_FILE"]) expect(await inRolledBack((tx) => attach(tx, p, { projectDocumentVersionId: "wv_v" })), p).toBeNull();
  });

  it("refuses a supply purpose on an award or a return, a return purpose on a project version, any other purpose on a return, and two owners", async () => {
    expect(await inRolledBack((tx) => attach(tx, "DELIVERY_ORDER", { awardId: "wv_a" }))).toBe("23514");
    expect(await inRolledBack((tx) => attach(tx, "SUPPLY_INVOICE", { awardOnlineReturnId: "wv_r" }))).toBe("23514");
    expect(await inRolledBack((tx) => attach(tx, "SIGNED_LETTER", { projectDocumentVersionId: "wv_v" }))).toBe("23514");
    expect(await inRolledBack((tx) => attach(tx, "PROJECT_DOCUMENT_FILE", { awardOnlineReturnId: "wv_r" }))).toBe("23514");
    expect(await inRolledBack((tx) => attach(tx, "COMPANY_RESOLUTION", { awardOnlineReturnId: "wv_r" }))).toBe("23514");
    expect(await inRolledBack((tx) => attach(tx, "SIGNED_LETTER", { awardId: "wv_a", awardOnlineReturnId: "wv_r" }))).toBe("23514");
  });

  it("holds a store version to one project version whatever its purpose (the one-pin index, widened)", async () => {
    expect(await inRolledBack(async (tx) => {
      await attach(tx, "PROJECT_DOCUMENT_FILE", { projectDocumentVersionId: "wv_v1" }, "wv_same");
      await attach(tx, "DELIVERY_ORDER", { projectDocumentVersionId: "wv_v2" }, "wv_same");
    })).toBe("23505");
    expect(await inRolledBack(async (tx) => {
      await attach(tx, "DELIVERY_ORDER", { projectDocumentVersionId: "wv_v1" }, "wv_same");
      await attach(tx, "SUPPLY_INVOICE", { projectDocumentVersionId: "wv_v1" }, "wv_same");
    })).toBe("23505");
    // Other owners are not limited by it.
    expect(await inRolledBack(async (tx) => {
      await attach(tx, "SIGNED_LETTER", { awardOnlineReturnId: "wv_r" }, "wv_same");
      await attach(tx, "SIGNED_LETTER", { awardId: "wv_a" }, "wv_same");
    })).toBeNull();
  });

  it("a store version held by a supply claim's file is kept from withdrawal, as a project file is (PA047, widened)", async () => {
    const bytes = randomBytes(24);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    await db.blobContent.create({ data: { organisationId, sha256, byteSize: BigInt(bytes.length), bytes } });
    const document = await db.document.create({ data: { organisationId, title: "Invoice", documentClassId, retentionSnapshot: {} } });
    const version = await db.documentVersion.create({ data: { organisationId, documentId: document.id, versionNo: 1, sha256, byteSize: BigInt(bytes.length), mediaType: "image/png", originalFilename: "invoice.png", recordedByPersonId: officer } });
    const c = await claim("SUPPLY_CLAIM");
    await db.documentAttachment.create({ data: { organisationId, purpose: "SUPPLY_INVOICE", versionId: version.id, projectDocumentVersionId: c.versionId } });
    expect(await refusal(db.documentVersion.update({ where: { id: version.id }, data: { withdrawnAt: now(), withdrawnReason: "Uploaded to the wrong record" } }))).toBe("PA047");
  });

  it("freezes the files of a decided online return: none added, changed or detached (PA051), for every login", async () => {
    const waiting = await lodge(db, await award());
    const decided = await lodge(db, await award());
    await verify(db, decided.id);
    expect(await inRolledBack((tx) => attach(tx, "SIGNED_LETTER", { awardOnlineReturnId: waiting.id }))).toBeNull();
    expect(await inRolledBack((tx) => attach(tx, "SIGNED_LETTER", { awardOnlineReturnId: decided.id }))).toBe("PA051");
    // Pinned while it waited, then decided: the pin is frozen.
    expect(await inRolledBack(async (tx) => {
      const r = await lodge(tx, await award());
      const id = `wv_att_${randomId()}`;
      await tx.$executeRawUnsafe(`INSERT INTO "DocumentAttachment" ("id", "organisationId", "purpose", "versionId", "awardOnlineReturnId") VALUES ($1, $2, 'DECLARATION', $3, $4)`, id, organisationId, `wv_ver_${randomId()}`, r.id);
      await refuse(tx, r.id);
      await tx.$executeRawUnsafe(`UPDATE "DocumentAttachment" SET "detachedAt" = now(), "detachReason" = 'Taken off' WHERE "id" = $1`, id);
    })).toBe("PA051");
    const rows = await db.$queryRawUnsafe<{ tgname: string; tgenabled: string }[]>(
      `SELECT tgname, tgenabled::text AS tgenabled FROM pg_trigger WHERE tgname IN ('AwardOnlineReturn_guard', 'AwardOnlineReturn_no_truncate', 'AwardQuery_guard', 'AwardQuery_no_truncate', 'SupplyInvoicePayment_insert', 'SupplyInvoicePayment_append_only', 'SupplyInvoicePayment_no_truncate', 'DocumentAttachment_online_return_frozen') ORDER BY tgname`,
    );
    expect(rows).toHaveLength(8);
    expect(rows.every((r) => r.tgenabled === "A")).toBe(true);
  });
});

describe("the staff notice kinds, the CHECK and kinds.ts together", () => {
  it("a notice of each new kind inserts", async () => {
    for (const kind of ["AWARD_RETURN_LODGED", "AWARD_QUERY_RAISED"] as const) {
      expect(STAFF_NOTICE_KINDS).toContain(kind);
      expect(await refusal(db.staffNotice.create({ data: { organisationId, recipientPersonId: officer, kind, subjectEntity: "Award", subjectId: `wv_${randomId()}`, title: "An award", body: "An award waits." } }))).toBeNull();
    }
  });
});
