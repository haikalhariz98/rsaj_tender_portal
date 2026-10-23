import { randomBytes, createHash } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { makePerson, makeSupplierAccount, randomId, testOrganisation } from "@/lib/test-db/auth-fixtures";

/**
 * The fix round's backstops (rulings PW-33, PW-37, PW-39, PW-42 of 2026-10-23), against migration 20261124000000. The acts judge first; these hold for
 * every login. Each refusal is told apart by its SQLSTATE: PA047 a project file kept from withdrawal, PA041 and PA042 the version's and the request's
 * own triggers, PA003 the store version's guard, 23505 a unique key.
 */

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

let organisationId: string;
/// The S.O., who records store files and uploads the organisation's versions.
let so: string;
/// The awardee's portal account, and an account of another supplier of the same organisation.
let awardeeAccount: string;
let otherAccount: string;
/// A contract awarded to the awardee, and one whose award names no supplier on the register.
let contractId: string;
let unnamedContractId: string;
let documentClassId: string;

function sqlState(error: unknown): string {
  const e = error as { code?: string; meta?: { driverAdapterError?: { cause?: { originalCode?: string; code?: string; kind?: string } } } };
  const cause = e.meta?.driverAdapterError?.cause;
  if (cause?.originalCode) return cause.originalCode;
  // A unique key refused through the client reads P2002, whatever the driver said.
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

const now = () => new Date();
const DAY = new Date("2026-10-23T00:00:00.000Z");

async function newContract(vendorId: string | null): Promise<string> {
  const run = randomId();
  const requisition = await db.requisition.create({
    data: { organisationId, reference: `PWF/RQ/${run}`, requestingUnitCode: "PWF_DEPT", requestingPersonId: so, title: "Fix round requisition", justification: "Tests.", needStatement: "None.", costCentreCode: "PWF_CC", accountCode: "PWF_AC", placeOfDelivery: "Nowhere", dateRequired: DAY, estimatedValue: "100000.00", raisedOn: DAY },
  });
  const exercise = await db.sourcingExercise.create({ data: { organisationId, reference: `PWF/EX/${run}`, requisitionId: requisition.id, title: `Culvert ${run}`, estimatedValue: "100000.00", sourcingMethodCode: "PWF_METHOD", status: "EVALUATED" } });
  const award = await db.award.create({ data: { organisationId, reference: `PWF/AW/${run}`, exerciseId: exercise.id, instrumentKind: "WORK_INDENT", awardeeName: "A Contractor", awardedValue: "100000.00", completionPeriod: 90, completionUnit: "DAYS", status: "ISSUED", vendorId } });
  return (await db.contract.create({ data: { organisationId, number: `PWF/CON/${run}`, numberSource: "SERIES", numberedOn: DAY, awardId: award.id, contractSum: "100000.00", status: "ACTIVE" } })).id;
}

beforeAll(async () => {
  organisationId = (await testOrganisation()).id;
  so = (await makePerson(organisationId, `S.O. ${randomId()}`)).id;
  const awardee = await makeSupplierAccount(organisationId);
  awardeeAccount = awardee.account!.id;
  otherAccount = (await makeSupplierAccount(organisationId)).account!.id;
  contractId = await newContract(awardee.supplier.id);
  unnamedContractId = await newContract(null);
  documentClassId = (await db.documentClass.create({ data: { organisationId, code: `pwf_${randomId()}`, nameEn: "Fix round class", classification: "INTERNAL" } })).id;
});

/// A stored file: a store document with its Version 1, recorded by the S.O.
async function storeVersion(): Promise<string> {
  const bytes = randomBytes(24);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  await db.blobContent.create({ data: { organisationId, sha256, byteSize: BigInt(bytes.length), bytes } });
  const document = await db.document.create({ data: { organisationId, title: "Site photograph", documentClassId, retentionSnapshot: {} } });
  return (await db.documentVersion.create({ data: { organisationId, documentId: document.id, versionNo: 1, sha256, byteSize: BigInt(bytes.length), mediaType: "image/png", originalFilename: "site.png", recordedByPersonId: so } })).id;
}

/// A contractor document of the awardee's contract with its Version 1, uploaded by the awardee's account.
async function projectVersion(): Promise<string> {
  const d = await db.projectDocument.create({ data: { organisationId, contractId, title: "Progress photographs", side: "CONTRACTOR", createdBySupplierAccountId: awardeeAccount, createdAt: now() } });
  return (await db.projectDocumentVersion.create({ data: { organisationId, documentId: d.id, number: 1, uploadedBySupplierAccountId: awardeeAccount, uploadedAt: now(), uploadedOn: DAY, noApproversAtUpload: true } })).id;
}

const pin = (versionId: string, projectDocumentVersionId: string) =>
  db.documentAttachment.create({ data: { organisationId, purpose: "PROJECT_DOCUMENT_FILE", versionId, projectDocumentVersionId } });

const withdraw = (tx: Tx | typeof db, versionId: string, withdrawnReason = "Uploaded to the wrong record") =>
  tx.documentVersion.update({ where: { id: versionId }, data: { withdrawnAt: now(), withdrawnReason } });

describe("PW-33: a store version held by a live project file is never withdrawn (PA047)", () => {
  it("refuses the withdrawal of a pinned project file and leaves it as it was, and still withdraws a version no project file holds", async () => {
    const pinned = await storeVersion();
    await pin(pinned, await projectVersion());
    expect(await refusal(withdraw(db, pinned))).toBe("PA047");
    expect((await db.documentVersion.findUniqueOrThrow({ where: { id: pinned } })).withdrawnAt).toBeNull();
    // A malformed withdrawal is the guard's to refuse first (it fires before, by name), as before this migration.
    expect(await refusal(withdraw(db, pinned, "  "))).toBe("PA003");

    const loose = await storeVersion();
    expect(await refusal(withdraw(db, loose))).toBeNull();
    expect((await db.documentVersion.findUniqueOrThrow({ where: { id: loose } })).withdrawnAt).not.toBeNull();
  });

  it("holds only a live project pin: the same store version under another purpose, or once its project pin is detached, still withdraws", async () => {
    const programme = await storeVersion();
    await db.documentAttachment.create({ data: { organisationId, purpose: "PROGRAMME", versionId: programme, contractId } });
    expect(await refusal(withdraw(db, programme))).toBeNull();

    const detached = await storeVersion();
    const a = await pin(detached, await projectVersion());
    await db.documentAttachment.update({ where: { id: a.id }, data: { detachedAt: now(), detachReason: "Replaced by a new version" } });
    expect(await refusal(withdraw(db, detached))).toBeNull();
  });

  it("fires for every login, replication role included (ENABLE ALWAYS)", async () => {
    const pinned = await storeVersion();
    await pin(pinned, await projectVersion());
    const ROLLBACK = new Error("rolled back on purpose");
    let state: string | null = "not run";
    try {
      await db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL session_replication_role = replica`);
        state = await refusal(withdraw(tx, pinned));
        throw ROLLBACK;
      });
    } catch (e) {
      if (e !== ROLLBACK) state = sqlState(e);
    }
    // The refusal aborts the transaction, so the rollback reaches the caller as the refusal itself or as the deliberate one: either way PA047 was raised.
    expect(state).toBe("PA047");
    const rows = await db.$queryRawUnsafe<{ tgenabled: string }[]>(`SELECT tgenabled::text AS tgenabled FROM pg_trigger WHERE tgname = 'DocumentVersion_project_file_kept'`);
    expect(rows).toEqual([{ tgenabled: "A" }]);
  });
});

describe("PW-37: a store version is pinned to one project version only (unique)", () => {
  it("refuses a second project pin of one store version, even once the first is detached, and leaves other purposes alone", async () => {
    const file = await storeVersion();
    const first = await pin(file, await projectVersion());
    expect(await refusal(pin(file, await projectVersion()))).toBe("23505");
    await db.documentAttachment.update({ where: { id: first.id }, data: { detachedAt: now(), detachReason: "Replaced by a new version" } });
    expect(await refusal(pin(file, await projectVersion()))).toBe("23505");
    // The index is partial: the same store version may still be filed under another purpose.
    expect(await refusal(db.documentAttachment.create({ data: { organisationId, purpose: "PROGRAMME", versionId: file, contractId } }))).toBeNull();
    expect(await refusal(db.documentAttachment.create({ data: { organisationId, purpose: "AS_BUILT", versionId: file, contractId } }))).toBeNull();
  });
});

describe("PW-39: a contractor-side account is the contract's awardee's (PA041, PA042)", () => {
  it("refuses a version uploaded by another supplier's account, and by any account when the award names no supplier, and accepts the awardee's (PA041)", async () => {
    const d = await db.projectDocument.create({ data: { organisationId, contractId, title: "Method statement", side: "CONTRACTOR", createdBySupplierAccountId: awardeeAccount, createdAt: now() } });
    const version = (accountId: string, documentId = d.id) =>
      db.projectDocumentVersion.create({ data: { organisationId, documentId, number: 1, uploadedBySupplierAccountId: accountId, uploadedAt: now(), uploadedOn: DAY, noApproversAtUpload: true } });
    expect(await refusal(version(otherAccount))).toBe("PA041");
    const unnamed = await db.projectDocument.create({ data: { organisationId, contractId: unnamedContractId, title: "Method statement", side: "CONTRACTOR", createdBySupplierAccountId: awardeeAccount, createdAt: now() } });
    expect(await refusal(version(awardeeAccount, unnamed.id))).toBe("PA041");
    expect(await refusal(version(awardeeAccount))).toBeNull();
  });

  it("refuses a request to the organisation from another supplier's account, and accepts the awardee's (PA042)", async () => {
    const d = await db.projectDocument.create({ data: { organisationId, contractId, title: "Drainage layout", side: "ORGANISATION", createdByPersonId: so, createdAt: now() } });
    const ask = (accountId: string) => db.projectDocumentRequest.create({ data: { organisationId, documentId: d.id, toSide: "ORGANISATION", requestedBySupplierAccountId: accountId, requestedAt: now() } });
    expect(await refusal(ask(otherAccount))).toBe("PA042");
    expect(await refusal(ask(awardeeAccount))).toBeNull();
  });

  it("still asks the contractor from a staff person, whoever the awardee is (the join reads only a portal account)", async () => {
    const d = await db.projectDocument.create({ data: { organisationId, contractId: unnamedContractId, title: "Insurance policy", side: "CONTRACTOR", createdBySupplierAccountId: awardeeAccount, createdAt: now() } });
    expect(await refusal(db.projectDocumentRequest.create({ data: { organisationId, documentId: d.id, toSide: "CONTRACTOR", requestedByPersonId: so, requestedAt: now() } }))).toBeNull();
  });
});
