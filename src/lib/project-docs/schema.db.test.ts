import { beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { ATTACHMENT_PURPOSES, OWNER_COLUMN, OWNER_KINDS, PURPOSE_OWNER } from "@/lib/documents/types";
import { STAFF_NOTICE_KINDS } from "@/lib/inbox/kinds";
import { makePerson, makeSupplierAccount, randomId, testOrganisation } from "@/lib/test-db/auth-fixtures";

/**
 * What the database itself holds of the Project workspace (ADR 0042 D1, plan step 1 §2.4), against migrations 20261122000000 and 20261122000100. The acts
 * (step 4 on) judge first; these are the backstops, for every login. Each refusal is told apart by its SQLSTATE: PA001 the trail's append-only refusal,
 * PA040 to PA044 the workspace's own triggers, 23514 a CHECK, 23505 a unique key.
 */

let organisationId: string;
let contractId: string;
/// Staff: `so` uploads the organisation's versions, `engineer` and `other` are approvers.
let so: string;
let engineer: string;
let other: string;
/// The contractor's portal account.
let account: string;

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
const DAY = new Date("2026-10-22T00:00:00.000Z");

beforeAll(async () => {
  organisationId = (await testOrganisation()).id;
  so = (await makePerson(organisationId, `S.O. ${randomId()}`)).id;
  engineer = (await makePerson(organisationId, `Engineer ${randomId()}`)).id;
  other = (await makePerson(organisationId, `Other ${randomId()}`)).id;
  account = (await makeSupplierAccount(organisationId)).account!.id;
  const run = randomId();
  const requisition = await db.requisition.create({
    data: { organisationId, reference: `PWS/RQ/${run}`, requestingUnitCode: "PWS_DEPT", requestingPersonId: so, title: "Workspace requisition", justification: "Tests.", needStatement: "None.", costCentreCode: "PWS_CC", accountCode: "PWS_AC", placeOfDelivery: "Nowhere", dateRequired: DAY, estimatedValue: "100000.00", raisedOn: DAY },
  });
  const exercise = await db.sourcingExercise.create({ data: { organisationId, reference: `PWS/EX/${run}`, requisitionId: requisition.id, title: `Drainage ${run}`, estimatedValue: "100000.00", sourcingMethodCode: "PWS_METHOD", status: "EVALUATED" } });
  const award = await db.award.create({ data: { organisationId, reference: `PWS/AW/${run}`, exerciseId: exercise.id, instrumentKind: "WORK_INDENT", awardeeName: "A Contractor", awardedValue: "100000.00", completionPeriod: 90, completionUnit: "DAYS", status: "ISSUED" } });
  contractId = (await db.contract.create({ data: { organisationId, number: `PWS/CON/${run}`, numberSource: "SERIES", numberedOn: DAY, awardId: award.id, contractSum: "100000.00", status: "ACTIVE" } })).id;
});

/// An ORGANISATION document, made by the S.O.
const orgDocument = () => db.projectDocument.create({ data: { organisationId, contractId, title: "Drainage layout", side: "ORGANISATION", createdByPersonId: so, createdAt: now() } });
/// A CONTRACTOR document, made by the contractor's account, with or without a kind.
const contractorDocument = (kind: "INTERIM_CLAIM" | "DELAY_NOTICE" | null = null) =>
  db.projectDocument.create({ data: { organisationId, contractId, title: "From the contractor", side: "CONTRACTOR", kind, createdBySupplierAccountId: account, createdAt: now() } });
const staffVersion = (documentId: string, number: number, by = so, requestId: string | null = null) =>
  db.projectDocumentVersion.create({ data: { organisationId, documentId, number, uploadedByPersonId: by, uploadedAt: now(), uploadedOn: DAY, noApproversAtUpload: false, requestId } });
const contractorVersion = (documentId: string, number: number, requestId: string | null = null) =>
  db.projectDocumentVersion.create({ data: { organisationId, documentId, number, uploadedBySupplierAccountId: account, uploadedAt: now(), uploadedOn: DAY, noApproversAtUpload: true, requestId } });
const approver = (documentId: string, personId: string) => db.projectDocumentApprover.create({ data: { organisationId, documentId, personId, addedByPersonId: so, addedAt: now() } });
const decide = (versionId: string, approverId: string | null, outcome: "APPROVED" | "REJECTED" | "TAKEN_UP" | "RETURNED", decidedByPersonId: string, remarks = "") =>
  db.projectDocumentDecision.create({ data: { organisationId, versionId, approverId, outcome, remarks, decidedByPersonId, decidedAt: now(), decidedOn: DAY } });

describe("a version is append-only, and comes from its document's side, numbered in order", () => {
  it("refuses UPDATE and DELETE of a version (PA001)", async () => {
    const d = await orgDocument();
    const v = await staffVersion(d.id, 1);
    expect(await refusal(db.projectDocumentVersion.update({ where: { id: v.id }, data: { note: "changed" } }))).toBe("PA001");
    expect(await refusal(db.projectDocumentVersion.delete({ where: { id: v.id } }))).toBe("PA001");
    expect(await refusal(db.$executeRawUnsafe(`TRUNCATE "ProjectDocumentVersion" CASCADE`))).toBe("PA001");
  });

  it("refuses a contractor-side version uploaded by a person, and an organisation-side one uploaded by an account (PA041)", async () => {
    const c = await contractorDocument();
    expect(await refusal(staffVersion(c.id, 1))).toBe("PA041");
    const o = await orgDocument();
    expect(await refusal(contractorVersion(o.id, 1))).toBe("PA041");
    expect(await refusal(contractorVersion(c.id, 1))).toBeNull();
  });

  it("refuses a gap in the numbers and a second Version 1 (PA041)", async () => {
    const d = await orgDocument();
    expect(await refusal(staffVersion(d.id, 2))).toBe("PA041");
    await staffVersion(d.id, 1);
    expect(await refusal(staffVersion(d.id, 1))).toBe("PA041");
    expect(await refusal(staffVersion(d.id, 2))).toBeNull();
  });

  it("refuses a version with no uploader, or two (CHECK)", async () => {
    const d = await orgDocument();
    expect(await refusal(db.projectDocumentVersion.create({ data: { organisationId, documentId: d.id, number: 1, uploadedByPersonId: so, uploadedBySupplierAccountId: account, uploadedAt: now(), uploadedOn: DAY, noApproversAtUpload: true } }))).toBe("23514");
  });
});

describe("a document is kept; only its kind is set, once", () => {
  it("refuses a change of title, a delete, and a kind set twice (PA040)", async () => {
    const d = await contractorDocument();
    expect(await refusal(db.projectDocument.update({ where: { id: d.id }, data: { title: "Other" } }))).toBe("PA040");
    expect(await refusal(db.projectDocument.delete({ where: { id: d.id } }))).toBe("PA040");
    expect(await refusal(db.projectDocument.update({ where: { id: d.id }, data: { kind: "INTERIM_CLAIM" } }))).toBeNull();
    expect(await refusal(db.projectDocument.update({ where: { id: d.id }, data: { kind: "DELAY_NOTICE" } }))).toBe("PA040");
    expect(await refusal(db.projectDocument.update({ where: { id: d.id }, data: { kind: null } }))).toBe("PA040");
  });

  it("refuses a kind on an ORGANISATION document (CHECK), and a kind set while an approver is live (PA040)", async () => {
    expect(await refusal(db.projectDocument.create({ data: { organisationId, contractId, title: "Programme", side: "ORGANISATION", kind: "WORK_PROGRAMME", createdByPersonId: so, createdAt: now() } }))).toBe("23514");
    const d = await contractorDocument();
    await approver(d.id, engineer);
    expect(await refusal(db.projectDocument.update({ where: { id: d.id }, data: { kind: "INTERIM_CLAIM" } }))).toBe("PA040");
  });

  it("refuses a blank title, and a document filed under another organisation than its contract's (CHECK, PA040)", async () => {
    expect(await refusal(db.projectDocument.create({ data: { organisationId, contractId, title: "   ", side: "ORGANISATION", createdByPersonId: so, createdAt: now() } }))).toBe("23514");
    const elsewhere = await db.organisation.upsert({ where: { code: "PWS_OTHER" }, update: {}, create: { code: "PWS_OTHER", name: "Another organisation" } });
    expect(await refusal(db.projectDocument.create({ data: { organisationId: elsewhere.id, contractId, title: "Stray", side: "ORGANISATION", createdByPersonId: so, createdAt: now() } }))).toBe("PA040");
  });
});

describe("a request goes to the document's side, from the other, one open at a time", () => {
  it("refuses a request to the asker's own side, and to the other side than the document's (PA042)", async () => {
    const c = await contractorDocument();
    expect(await refusal(db.projectDocumentRequest.create({ data: { organisationId, documentId: c.id, toSide: "CONTRACTOR", requestedBySupplierAccountId: account, requestedAt: now() } }))).toBe("PA042");
    expect(await refusal(db.projectDocumentRequest.create({ data: { organisationId, documentId: c.id, toSide: "ORGANISATION", requestedBySupplierAccountId: account, requestedAt: now() } }))).toBe("PA042");
  });

  it("keeps one open request: a second is refused until a version answers the first (PA042), and the request is append-only (PA001)", async () => {
    const c = await contractorDocument();
    const r1 = await db.projectDocumentRequest.create({ data: { organisationId, documentId: c.id, toSide: "CONTRACTOR", requestedByPersonId: so, requestedAt: now() } });
    expect(await refusal(db.projectDocumentRequest.create({ data: { organisationId, documentId: c.id, toSide: "CONTRACTOR", requestedByPersonId: so, requestedAt: now() } }))).toBe("PA042");
    expect(await refusal(db.projectDocumentRequest.update({ where: { id: r1.id }, data: { note: "changed" } }))).toBe("PA001");
    await contractorVersion(c.id, 1, r1.id);
    expect(await refusal(db.projectDocumentRequest.create({ data: { organisationId, documentId: c.id, toSide: "CONTRACTOR", requestedByPersonId: so, requestedAt: now() } }))).toBeNull();
  });

  it("refuses a version that answers another document's request (PA041), or a request already answered (unique)", async () => {
    const a = await contractorDocument();
    const b = await contractorDocument();
    const r = await db.projectDocumentRequest.create({ data: { organisationId, documentId: a.id, toSide: "CONTRACTOR", requestedByPersonId: so, requestedAt: now() } });
    expect(await refusal(contractorVersion(b.id, 1, r.id))).toBe("PA041");
    await contractorVersion(a.id, 1, r.id);
    expect(await refusal(contractorVersion(a.id, 2, r.id))).toBe("23505");
  });
});

describe("approvers: named on a document with no kind, removed once with a reason", () => {
  it("refuses an approver row on a document with a kind (PA043)", async () => {
    const d = await contractorDocument("INTERIM_CLAIM");
    expect(await refusal(approver(d.id, engineer))).toBe("PA043");
  });

  it("refuses the same person live twice (unique), allows them again once removed, and removes once, with a reason (CHECK, PA043)", async () => {
    const d = await orgDocument();
    const a = await approver(d.id, engineer);
    expect(await refusal(approver(d.id, engineer))).toBe("23505");
    expect(await refusal(db.projectDocumentApprover.update({ where: { id: a.id }, data: { removedAt: now(), removedByPersonId: so } }))).toBe("23514");
    expect(await refusal(db.projectDocumentApprover.update({ where: { id: a.id }, data: { personId: other } }))).toBe("PA043");
    expect(await refusal(db.projectDocumentApprover.update({ where: { id: a.id }, data: { removedAt: now(), removedByPersonId: so, removeReason: "Replaced by the engineer's deputy" } }))).toBeNull();
    expect(await refusal(db.projectDocumentApprover.update({ where: { id: a.id }, data: { removeReason: "Again" } }))).toBe("PA043");
    expect(await refusal(db.projectDocumentApprover.delete({ where: { id: a.id } }))).toBe("PA043");
    expect(await refusal(approver(d.id, engineer))).toBeNull();
  });
});

describe("decisions: append-only, on the latest version, by a live approver who did not upload it", () => {
  it("refuses a second decision by the same approver on one version (unique), and any change to a decision (PA001)", async () => {
    const d = await orgDocument();
    const a = await approver(d.id, engineer);
    const v = await staffVersion(d.id, 1);
    const x = await decide(v.id, a.id, "APPROVED", engineer);
    expect(await refusal(decide(v.id, a.id, "REJECTED", engineer, "Invert levels missing at MH3"))).toBe("23505");
    expect(await refusal(db.projectDocumentDecision.update({ where: { id: x.id }, data: { remarks: "changed" } }))).toBe("PA001");
    expect(await refusal(db.projectDocumentDecision.delete({ where: { id: x.id } }))).toBe("PA001");
  });

  it("refuses APPROVED on a document with a kind, and TAKEN_UP on one without (PA044)", async () => {
    const k = await contractorDocument("INTERIM_CLAIM");
    const kv = await contractorVersion(k.id, 1);
    const plain = await contractorDocument();
    const a = await approver(plain.id, engineer);
    const pv = await contractorVersion(plain.id, 1);
    // The trigger runs before the CHECKs: on a document with a kind an approval is refused by the kind, named an approver or not.
    expect(await refusal(decide(kv.id, null, "APPROVED", engineer))).toBe("PA044");
    // On a plain document, an approval that names no approver is the CHECK's to refuse.
    expect(await refusal(decide(pv.id, null, "APPROVED", engineer))).toBe("23514");
    expect(await refusal(decide(kv.id, a.id, "APPROVED", engineer))).toBe("PA044");
    expect(await refusal(decide(pv.id, null, "TAKEN_UP", engineer))).toBe("PA044");
    expect(await refusal(decide(kv.id, null, "TAKEN_UP", engineer))).toBeNull();
    // One mark per version.
    expect(await refusal(decide(kv.id, null, "RETURNED", engineer, "The second page is missing"))).toBe("23505");
    expect(await refusal(decide(pv.id, a.id, "APPROVED", engineer))).toBeNull();
  });

  it("refuses a decision on a version that is not the latest (PA044)", async () => {
    const d = await contractorDocument();
    const a = await approver(d.id, engineer);
    const v1 = await contractorVersion(d.id, 1);
    await contractorVersion(d.id, 2);
    expect(await refusal(decide(v1.id, a.id, "REJECTED", engineer, "Invert levels missing at MH3"))).toBe("PA044");
  });

  it("refuses a decision by the version's own uploader (PA044)", async () => {
    const d = await orgDocument();
    const a = await approver(d.id, engineer);
    const v = await staffVersion(d.id, 1, engineer);
    expect(await refusal(decide(v.id, a.id, "APPROVED", engineer))).toBe("PA044");
  });

  it("refuses a decision by a removed approver, by someone deciding in another's name, and by another document's approver (PA044)", async () => {
    const d = await orgDocument();
    const a = await approver(d.id, engineer);
    const b = await approver(d.id, other);
    const v = await staffVersion(d.id, 1);
    expect(await refusal(decide(v.id, a.id, "APPROVED", other))).toBe("PA044");
    const elsewhere = await orgDocument();
    const stranger = await approver(elsewhere.id, other);
    expect(await refusal(decide(v.id, stranger.id, "APPROVED", other))).toBe("PA044");
    await db.projectDocumentApprover.update({ where: { id: b.id }, data: { removedAt: now(), removedByPersonId: so, removeReason: "Away for the month" } });
    expect(await refusal(decide(v.id, b.id, "APPROVED", other))).toBe("PA044");
  });

  it("refuses a rejection or a return with blank remarks, and accepts an approval with none (CHECK)", async () => {
    const d = await orgDocument();
    const a = await approver(d.id, engineer);
    const v = await staffVersion(d.id, 1);
    expect(await refusal(decide(v.id, a.id, "REJECTED", engineer, "  "))).toBe("23514");
    const k = await contractorDocument("DELAY_NOTICE");
    const kv = await contractorVersion(k.id, 1);
    expect(await refusal(decide(kv.id, null, "RETURNED", engineer))).toBe("23514");
    expect(await refusal(decide(v.id, a.id, "APPROVED", engineer))).toBeNull();
  });
});

describe("the attachment owners, replaced whole (owner-check.test.ts holds the list to the schema and the lib)", () => {
  type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];
  /// Inside a transaction that is always rolled back, with session_replication_role set to replica: the foreign keys (system triggers) are not checked, so
  /// one row per owner needs no owner record, while every CHECK still is. Nothing is left behind. Null when the work went through, else its SQLSTATE.
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
  const attach = (tx: Tx, purpose: string, owners: Record<string, string>) =>
    tx.$executeRawUnsafe(
      `INSERT INTO "DocumentAttachment" ("id", "organisationId", "purpose", "versionId", ${Object.keys(owners).map((k) => `"${k}"`).join(", ")}) VALUES ($1, $2, $3::"AttachmentPurpose", $4, ${Object.keys(owners).map((_, i) => `$${i + 5}`).join(", ")})`,
      `pws_att_${randomId()}`,
      organisationId,
      purpose,
      `pws_ver_${randomId()}`,
      ...Object.values(owners),
    );

  it("every purpose still inserts on its own owner, the new one included", async () => {
    for (const p of ATTACHMENT_PURPOSES) expect(await inRolledBack((tx) => attach(tx, p, { [OWNER_COLUMN[PURPOSE_OWNER[p]]]: `pws_owner_${randomId()}` })), p).toBeNull();
    expect(new Set(ATTACHMENT_PURPOSES.map((p) => PURPOSE_OWNER[p]))).toEqual(new Set(OWNER_KINDS));
    expect(OWNER_COLUMN.projectDocumentVersion).toBe("projectDocumentVersionId");
    expect(PURPOSE_OWNER.PROJECT_DOCUMENT_FILE).toBe("projectDocumentVersion");
  });

  it("refuses an attachment with both a contract and a project version, and a project file on any other owner (CHECK)", async () => {
    expect(await inRolledBack((tx) => attach(tx, "PROJECT_DOCUMENT_FILE", { contractId: "pws_c", projectDocumentVersionId: "pws_v" }))).toBe("23514");
    expect(await inRolledBack((tx) => attach(tx, "PROJECT_DOCUMENT_FILE", { contractId: "pws_c" }))).toBe("23514");
    expect(await inRolledBack((tx) => attach(tx, "PROGRAMME", { projectDocumentVersionId: "pws_v" }))).toBe("23514");
  });
});

describe("the staff notice kinds, the CHECK and kinds.ts together", () => {
  it("a notice of each new kind inserts, and an unknown kind is refused (CHECK)", async () => {
    for (const kind of ["PROJECT_DOCUMENT_TO_APPROVE", "PROJECT_DOCUMENT_FROM_CONTRACTOR", "PROJECT_DOCUMENT_REQUESTED"] as const) {
      expect(STAFF_NOTICE_KINDS).toContain(kind);
      expect(await refusal(db.staffNotice.create({ data: { organisationId, recipientPersonId: so, kind, subjectEntity: "ProjectDocumentVersion", subjectId: `pws_${randomId()}`, title: "A document", body: "A document waits." } }))).toBeNull();
    }
    expect(await refusal(db.staffNotice.create({ data: { organisationId, recipientPersonId: so, kind: "PROJECT_DOCUMENT_OVERDUE", subjectEntity: "ProjectDocumentVersion", subjectId: `pws_${randomId()}`, title: "x", body: "x" } }))).toBe("23514");
  });
});
