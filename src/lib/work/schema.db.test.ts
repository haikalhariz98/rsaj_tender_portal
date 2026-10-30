import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { ATTACHMENT_PURPOSES, OWNER_COLUMN, OWNER_KINDS, purposeOwners } from "@/lib/documents/types";
import { STAFF_NOTICE_KINDS } from "@/lib/inbox/kinds";
import { readWorkItems } from "@/lib/portal/data-export-store";
import { makePerson, makeSupplierAccount, randomId, testOrganisation } from "@/lib/test-db/auth-fixtures";

import { LOCATION_MAX, TEXT_MAX, TITLE_MAX } from "./bounds";
import { TEAM_ROLES, WORK_ITEM_TYPES, type WorkItemType } from "./types";

/**
 * What the database itself holds of work items (workspace 3a plan section 3.1, step 1), against migrations 20261210000800 and 20261210000900. The acts
 * (step 3) judge first; these are the backstops, for every login. Each refusal is told apart by its SQLSTATE and, for a CHECK, by the constraint's name, so
 * a row refused by another CHECK than the one under test fails the test: 23514 a CHECK, 23505 a unique key, PA001 the trail's append-only refusal.
 *
 * Workspace 3b (plan workspace-3b-build-plan.md section 3.1, step 1), against migrations 20261210001100 and 20261210001200: sharing (PA055 one-way), the contractor as
 * raiser, assignee and writer, a Reply only on a shared item (PA056), a work item file kept from withdrawal (PA047, widened), the new notice kind and the Project team.
 */

let organisationId: string;
let contractId: string;
let raiser: string;
let other: string;
let account: string;
let supplierId: string;
let projectDocumentId: string;
let documentClassId: string;

/// "23514 WorkItem_title_present", "23505", "PA001": the SQLSTATE, and the constraint's name where the database gave one.
function refusalOf(error: unknown): string {
  const e = error as { code?: string; message?: string; meta?: { driverAdapterError?: { cause?: { originalCode?: string; code?: string; kind?: string; constraint?: unknown } } } };
  const cause = e.meta?.driverAdapterError?.cause;
  const code = cause?.originalCode ?? (e.code === "P2002" ? "23505" : (cause?.code ?? cause?.kind ?? `not a database refusal: ${String(error).slice(0, 300)}`));
  if (code !== "23514") return code;
  const name = /"?((?:WorkItem|WorkItemComment|WorkItemLink|DocumentAttachment|StaffNotice|ProjectTeamMember)_[a-z_]+)"?/.exec(`${JSON.stringify(cause)} ${e.message ?? ""}`)?.[1];
  return name ? `${code} ${name}` : code;
}

async function refusal(work: Promise<unknown>): Promise<string | null> {
  try {
    await work;
    return null;
  } catch (error) {
    return refusalOf(error);
  }
}

const now = () => new Date();
const DAY = new Date("2026-10-29T00:00:00.000Z");
let next = 1;

type ItemData = Parameters<typeof db.workItem.create>[0]["data"];
/// A valid item of the type: the type's own required columns set, nothing else. `o` changes exactly what a test is about.
function item(type: WorkItemType, o: Partial<Record<string, unknown>> = {}) {
  const own: Record<WorkItemType, Record<string, unknown>> = {
    RFI: { dueOn: DAY },
    SITE_INSTRUCTION: { dueOn: DAY },
    INSPECTION: { inspectionResult: "NOT_YET" },
    SAFETY_INCIDENT: { severity: "NEAR_MISS", happenedAt: now() },
    ACTION: {},
    DEFECT: {},
    TASK: {},
  };
  const data = { organisationId, contractId, type, number: next++, title: "Rebar spacing at grid C4", raisedByPersonId: raiser, recordedAt: now(), ...own[type], ...o } as ItemData;
  return db.workItem.create({ data });
}

beforeAll(async () => {
  organisationId = (await testOrganisation()).id;
  raiser = (await makePerson(organisationId, `Raiser ${randomId()}`)).id;
  other = (await makePerson(organisationId, `Other ${randomId()}`)).id;
  const contractor = await makeSupplierAccount(organisationId);
  account = contractor.account!.id;
  supplierId = contractor.supplier.id;
  const run = randomId();
  const requisition = await db.requisition.create({
    data: { organisationId, reference: `WIS/RQ/${run}`, requestingUnitCode: "WIS_DEPT", requestingPersonId: raiser, title: "Work items requisition", justification: "Tests.", needStatement: "None.", costCentreCode: "WIS_CC", accountCode: "WIS_AC", placeOfDelivery: "Nowhere", dateRequired: DAY, estimatedValue: "100000.00", raisedOn: DAY },
  });
  const exercise = await db.sourcingExercise.create({ data: { organisationId, reference: `WIS/EX/${run}`, requisitionId: requisition.id, title: `Drainage ${run}`, estimatedValue: "100000.00", sourcingMethodCode: "WIS_METHOD", status: "EVALUATED" } });
  const award = await db.award.create({ data: { organisationId, reference: `WIS/AW/${run}`, exerciseId: exercise.id, instrumentKind: "WORK_INDENT", awardeeName: "A Contractor", awardedValue: "100000.00", completionPeriod: 90, completionUnit: "DAYS", status: "ISSUED", vendorId: contractor.supplier.id } });
  contractId = (await db.contract.create({ data: { organisationId, number: `WIS/CON/${run}`, numberSource: "SERIES", numberedOn: DAY, awardId: award.id, contractSum: "100000.00", status: "ACTIVE" } })).id;
  projectDocumentId = (await db.projectDocument.create({ data: { organisationId, contractId, title: "Drainage layout", side: "ORGANISATION", createdByPersonId: raiser, createdAt: now() } })).id;
  documentClassId = (await db.documentClass.create({ data: { organisationId, code: `wis_${run}`, nameEn: "Work item class", classification: "INTERNAL" } })).id;
});

describe("a work item: each type's valid row inserts, and each CHECK refuses its own bad row", () => {
  it("one valid row of every type inserts, with the defaults the plan names", async () => {
    for (const t of WORK_ITEM_TYPES) expect(await refusal(item(t)), t).toBeNull();
    const i = await item("TASK");
    expect({ status: i.status, priority: i.priority, description: i.description, location: i.location, answer: i.answer, cancelReason: i.cancelReason, closedAt: i.closedAt }).toEqual({ status: "TO_DO", priority: "NORMAL", description: "", location: "", answer: "", cancelReason: "", closedAt: null });
  });

  it("number, title and the raiser", async () => {
    expect(await refusal(item("TASK", { number: 0 }))).toBe("23514 WorkItem_number_positive");
    expect(await refusal(item("TASK", { title: "   " }))).toBe("23514 WorkItem_title_present");
    // Changed for 3b (faithful): 3a's NOT NULL CHECK is replaced by "exactly one raiser" (WorkItem_one_raiser).
    expect(await refusal(item("TASK", { raisedByPersonId: null }))).toBe("23514 WorkItem_one_raiser");
  });

  it("the bounds, in code points as bounds.ts counts them: the bound itself inserts, one more is refused", async () => {
    const wide = (n: number) => "\u{1F9F1}".repeat(n); // a brick: one code point, two UTF-16 units
    expect(await refusal(item("TASK", { title: wide(TITLE_MAX) }))).toBeNull();
    expect(await refusal(item("TASK", { title: wide(TITLE_MAX + 1) }))).toBe("23514 WorkItem_lengths");
    expect(await refusal(item("TASK", { location: "x".repeat(LOCATION_MAX + 1) }))).toBe("23514 WorkItem_lengths");
    expect(await refusal(item("TASK", { description: "x".repeat(TEXT_MAX + 1) }))).toBe("23514 WorkItem_lengths");
    expect(await refusal(item("RFI", { answer: "x".repeat(TEXT_MAX + 1) }))).toBe("23514 WorkItem_lengths");
    expect(await refusal(item("TASK", { status: "CANCELLED", closedAt: now(), cancelReason: "x".repeat(TEXT_MAX + 1) }))).toBe("23514 WorkItem_lengths");
    expect(await refusal(item("TASK", { location: "x".repeat(LOCATION_MAX), description: "x".repeat(TEXT_MAX) }))).toBeNull();
  });

  // Changed for 3b (stricter): the account column on its own now needs the item shared (WorkItem_contractor_party_shared), and the contractor (the company) is a
  // third assignee form.
  it("at most one assignee: a person, the contractor or the contractor's account, never two", async () => {
    const shared = { sharedAt: now() };
    expect(await refusal(item("TASK", { assigneePersonId: other, assigneeSupplierAccountId: account, ...shared }))).toBe("23514 WorkItem_one_assignee");
    expect(await refusal(item("TASK", { assigneePersonId: other, assignedToContractor: true, ...shared }))).toBe("23514 WorkItem_one_assignee");
    expect(await refusal(item("TASK", { assignedToContractor: true, assigneeSupplierAccountId: account, ...shared }))).toBe("23514 WorkItem_one_assignee");
    expect(await refusal(item("TASK", { assigneePersonId: other }))).toBeNull();
    expect(await refusal(item("TASK", { assigneeSupplierAccountId: account, ...shared }))).toBeNull();
    expect(await refusal(item("TASK", { assignedToContractor: true, ...shared }))).toBeNull();
  });

  it("each type's own columns, on that type only", async () => {
    expect(await refusal(item("TASK", { impact: "COST" }))).toBe("23514 WorkItem_impact_of_type");
    expect(await refusal(item("RFI", { impact: "COST" }))).toBeNull();
    expect(await refusal(item("SITE_INSTRUCTION", { impact: "TIME" }))).toBeNull();
    expect(await refusal(item("SITE_INSTRUCTION", { answer: "Use 150 mm" }))).toBe("23514 WorkItem_answer_of_type");
    expect(await refusal(item("RFI", { answer: "Use 150 mm" }))).toBeNull();
    expect(await refusal(item("INSPECTION", { inspectionResult: null }))).toBe("23514 WorkItem_result_of_type");
    expect(await refusal(item("TASK", { inspectionResult: "PASSED" }))).toBe("23514 WorkItem_result_of_type");
    expect(await refusal(item("SAFETY_INCIDENT", { severity: null }))).toBe("23514 WorkItem_incident_of_type");
    expect(await refusal(item("SAFETY_INCIDENT", { happenedAt: null }))).toBe("23514 WorkItem_incident_of_type");
    expect(await refusal(item("TASK", { severity: "FIRST_AID" }))).toBe("23514 WorkItem_incident_of_type");
    expect(await refusal(item("TASK", { happenedAt: now() }))).toBe("23514 WorkItem_incident_of_type");
    expect(await refusal(item("TASK", { fromDocumentId: projectDocumentId }))).toBe("23514 WorkItem_from_document_of_type");
    expect(await refusal(item("ACTION", { fromDocumentId: projectDocumentId }))).toBeNull();
    expect(await refusal(item("RFI", { dueOn: null }))).toBe("23514 WorkItem_due_of_type");
    expect(await refusal(item("SITE_INSTRUCTION", { dueOn: null }))).toBe("23514 WorkItem_due_of_type");
    expect(await refusal(item("TASK", { dueOn: null }))).toBeNull();
  });

  it("a cancelled item says why, and closedAt is set exactly when Done or Cancelled (set on close, cleared on reopen)", async () => {
    expect(await refusal(item("TASK", { status: "CANCELLED", closedAt: now(), cancelReason: " " }))).toBe("23514 WorkItem_cancel_reason");
    expect(await refusal(item("TASK", { status: "CANCELLED", cancelReason: "Raised twice" }))).toBe("23514 WorkItem_closed_at");
    expect(await refusal(item("TASK", { status: "DONE" }))).toBe("23514 WorkItem_closed_at");
    expect(await refusal(item("TASK", { status: "TO_DO", closedAt: now() }))).toBe("23514 WorkItem_closed_at");
    const i = await item("TASK", { status: "DONE", closedAt: now() });
    expect(await refusal(db.workItem.update({ where: { id: i.id }, data: { status: "TO_DO" } }))).toBe("23514 WorkItem_closed_at");
    expect(await refusal(db.workItem.update({ where: { id: i.id }, data: { status: "TO_DO", closedAt: null } }))).toBeNull();
  });

  it("refuses a second item of the same contract, type and number; the same number on another type inserts", async () => {
    const n = next++;
    await item("RFI", { number: n });
    expect(await refusal(item("RFI", { number: n }))).toBe("23505");
    expect(await refusal(item("TASK", { number: n }))).toBeNull();
  });
});

describe("a comment: present, bounded, by a person, and append-only", () => {
  const comment = (workItemId: string, o: Partial<Record<string, unknown>> = {}) =>
    db.workItemComment.create({ data: { organisationId, workItemId, body: "Please confirm the bar size.", personId: raiser, recordedAt: now(), ...o } as Parameters<typeof db.workItemComment.create>[0]["data"] });

  it("refuses a blank or over-long body and a comment with no person (CHECK)", async () => {
    const i = await item("TASK");
    expect(await refusal(comment(i.id, { body: "  " }))).toBe("23514 WorkItemComment_body");
    expect(await refusal(comment(i.id, { body: "x".repeat(TEXT_MAX + 1) }))).toBe("23514 WorkItemComment_body");
    // Changed for 3b (faithful): 3a's NOT NULL CHECK is replaced by "exactly one writer" (WorkItemComment_one_writer).
    expect(await refusal(comment(i.id, { personId: null }))).toBe("23514 WorkItemComment_one_writer");
    expect(await refusal(comment(i.id))).toBeNull();
  });

  it("refuses UPDATE, DELETE and TRUNCATE (PA001)", async () => {
    const i = await item("TASK");
    const c = await comment(i.id);
    expect(await refusal(db.workItemComment.update({ where: { id: c.id }, data: { body: "changed" } }))).toBe("PA001");
    expect(await refusal(db.workItemComment.delete({ where: { id: c.id } }))).toBe("PA001");
    expect(await refusal(db.$executeRawUnsafe(`TRUNCATE "WorkItemComment" CASCADE`))).toBe("PA001");
  });
});

describe("a link: exactly one target, never itself, never twice", () => {
  const link = (workItemId: string, o: Partial<Record<string, unknown>>) =>
    db.workItemLink.create({ data: { organisationId, workItemId, personId: raiser, recordedAt: now(), ...o } as Parameters<typeof db.workItemLink.create>[0]["data"] });

  it("refuses no target, two targets and a link to itself (CHECK), and the same link twice (unique)", async () => {
    const a = await item("TASK");
    const b = await item("RFI");
    expect(await refusal(link(a.id, {}))).toBe("23514 WorkItemLink_one_target");
    expect(await refusal(link(a.id, { toWorkItemId: b.id, projectDocumentId }))).toBe("23514 WorkItemLink_one_target");
    expect(await refusal(link(a.id, { toWorkItemId: a.id }))).toBe("23514 WorkItemLink_not_itself");
    expect(await refusal(link(a.id, { toWorkItemId: b.id }))).toBeNull();
    expect(await refusal(link(a.id, { toWorkItemId: b.id }))).toBe("23505");
    expect(await refusal(link(a.id, { projectDocumentId }))).toBeNull();
    expect(await refusal(link(a.id, { projectDocumentId }))).toBe("23505");
    // A link is removed by delete (audited by the act); nothing refuses it here.
    const l = await link(b.id, { projectDocumentId });
    expect(await refusal(db.workItemLink.delete({ where: { id: l.id } }))).toBeNull();
  });
});

describe("the attachment owners, replaced whole (owner-check.test.ts holds the list to the schema and the lib)", () => {
  type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];
  /// Inside a transaction that is always rolled back, with session_replication_role set to replica: the foreign keys (system triggers) are not checked, so
  /// one row per owner needs no owner record, while every CHECK still is. Nothing is left behind. Null when the work went through, else its refusal.
  async function inRolledBack(fn: (tx: Tx) => Promise<unknown>): Promise<string | null> {
    const ROLLBACK = new Error("rolled back on purpose");
    try {
      await db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL session_replication_role = replica`);
        await fn(tx);
        throw ROLLBACK;
      });
    } catch (e) {
      return e === ROLLBACK ? null : refusalOf(e);
    }
    return "not rolled back";
  }
  const attach = (tx: Tx, purpose: string, owners: Record<string, string>) =>
    tx.$executeRawUnsafe(
      `INSERT INTO "DocumentAttachment" ("id", "organisationId", "purpose", "versionId", ${Object.keys(owners).map((k) => `"${k}"`).join(", ")}) VALUES ($1, $2, $3::"AttachmentPurpose", $4, ${Object.keys(owners).map((_, i) => `$${i + 5}`).join(", ")})`,
      `wis_att_${randomId()}`,
      organisationId,
      purpose,
      `wis_ver_${randomId()}`,
      ...Object.values(owners),
    );

  it("every purpose still inserts on every owner it has, the work item included, and between them they cover every owner", async () => {
    for (const p of ATTACHMENT_PURPOSES) for (const k of purposeOwners(p)) expect(await inRolledBack((tx) => attach(tx, p, { [OWNER_COLUMN[k]]: `wis_owner_${randomId()}` })), `${p} on ${k}`).toBeNull();
    expect(new Set(ATTACHMENT_PURPOSES.flatMap((p) => purposeOwners(p)))).toEqual(new Set(OWNER_KINDS));
  });

  it("refuses an attachment with two owners, a work item file on another owner, and another purpose on a work item (CHECK)", async () => {
    expect(await inRolledBack((tx) => attach(tx, "WORK_ITEM_FILE", { workItemId: "wis_w", contractId: "wis_c" }))).toBe("23514 DocumentAttachment_one_owner");
    expect(await inRolledBack((tx) => attach(tx, "WORK_ITEM_FILE", { contractId: "wis_c" }))).toBe("23514 DocumentAttachment_purpose_owner");
    expect(await inRolledBack((tx) => attach(tx, "PROGRAMME", { workItemId: "wis_w" }))).toBe("23514 DocumentAttachment_purpose_owner");
  });
});

describe("the staff notice kinds, the CHECK and kinds.ts together", () => {
  it("a notice of each new kind inserts, and an unknown kind is refused (CHECK)", async () => {
    // Changed for 3b (stricter): WORK_ITEM_FROM_CONTRACTOR joins the kinds.
    for (const kind of ["WORK_ITEM_ASSIGNED", "WORK_ITEM_TO_CHECK", "WORK_ITEM_RETURNED", "WORK_ITEM_COMMENT", "WORK_ITEM_FROM_CONTRACTOR"] as const) {
      expect(STAFF_NOTICE_KINDS).toContain(kind);
      expect(await refusal(db.staffNotice.create({ data: { organisationId, recipientPersonId: raiser, kind, subjectEntity: "WorkItem", subjectId: `wis_${randomId()}`, occurrence: `wis_${randomId()}`, title: "RFI 1", body: "RFI 1 · A title" } })), kind).toBeNull();
    }
    expect(await refusal(db.staffNotice.create({ data: { organisationId, recipientPersonId: raiser, kind: "WORK_ITEM_DUE_TOMORROW", subjectEntity: "WorkItem", subjectId: `wis_${randomId()}`, title: "x", body: "x" } }))).toBe("23514 StaffNotice_kind_known");
  });
});

// ------------------------------------------------------------------------------------------------ workspace 3b, step 1

describe("3b: sharing is stored, never backfilled, and one-way (ADR 0049 D1)", () => {
  it("a row written as 3a wrote it reads unshared, not on the contractor; and the migration writes no item (no backfill)", async () => {
    const i = await item("RFI");
    expect({ sharedAt: i.sharedAt, assignedToContractor: i.assignedToContractor, raisedBySupplierAccountId: i.raisedBySupplierAccountId, defectItemId: i.defectItemId }).toEqual({ sharedAt: null, assignedToContractor: false, raisedBySupplierAccountId: null, defectItemId: null });
    const sql = readFileSync(path.join(process.cwd(), "prisma/migrations/20261210001100_work_items_shared/migration.sql"), "utf8").replace(/--[^\n]*/g, "");
    expect(sql).not.toMatch(/UPDATE\s+"WorkItem"|INSERT\s+INTO\s+"WorkItem"/i);
    expect(sql).toMatch(/ADD COLUMN\s+"sharedAt" TIMESTAMP\(3\);/);
  });

  it("an unshared item is shared once; then sharedAt never changes, never returns to null, and the row is never deleted (PA055)", async () => {
    const i = await item("TASK");
    const at = now();
    expect(await refusal(db.workItem.update({ where: { id: i.id }, data: { sharedAt: at } }))).toBeNull();
    expect(await refusal(db.workItem.update({ where: { id: i.id }, data: { sharedAt: null } }))).toBe("PA055");
    expect(await refusal(db.workItem.update({ where: { id: i.id }, data: { sharedAt: new Date(at.getTime() + 1000) } }))).toBe("PA055");
    expect(await refusal(db.workItem.update({ where: { id: i.id }, data: { sharedAt: at, title: "Same instant, new title" } }))).toBeNull();
    expect(await refusal(db.workItem.delete({ where: { id: i.id } }))).toBe("PA055");
    // Raw SQL is refused alike: the trigger is ENABLE ALWAYS.
    expect(await refusal(db.$executeRawUnsafe(`UPDATE "WorkItem" SET "sharedAt" = NULL WHERE "id" = $1`, i.id))).toBe("PA055");
    const loose = await item("TASK");
    expect(await refusal(db.workItem.delete({ where: { id: loose.id } }))).toBeNull();
  });

  it("an item the contractor holds or raised is shared (CHECK)", async () => {
    expect(await refusal(item("TASK", { assignedToContractor: true }))).toBe("23514 WorkItem_contractor_party_shared");
    expect(await refusal(item("TASK", { assigneeSupplierAccountId: account }))).toBe("23514 WorkItem_contractor_party_shared");
    expect(await refusal(item("RFI", { raisedByPersonId: null, raisedBySupplierAccountId: account }))).toBe("23514 WorkItem_contractor_party_shared");
    const i = await item("TASK");
    expect(await refusal(db.workItem.update({ where: { id: i.id }, data: { assignedToContractor: true } }))).toBe("23514 WorkItem_contractor_party_shared");
    expect(await refusal(db.workItem.update({ where: { id: i.id }, data: { assignedToContractor: true, sharedAt: now() } }))).toBeNull();
  });
});

describe("3b: the contractor as raiser (B-8)", () => {
  const shared = () => ({ sharedAt: now() });
  it("exactly one raiser: a person or a contractor's account (CHECK)", async () => {
    expect(await refusal(item("RFI", { raisedBySupplierAccountId: account, ...shared() }))).toBe("23514 WorkItem_one_raiser");
    expect(await refusal(item("RFI", { raisedByPersonId: null, raisedBySupplierAccountId: account, ...shared() }))).toBeNull();
  });
  it("the contractor raises an RFI or a safety incident only (CHECK)", async () => {
    expect(await refusal(item("SAFETY_INCIDENT", { raisedByPersonId: null, raisedBySupplierAccountId: account, ...shared() }))).toBeNull();
    for (const t of WORK_ITEM_TYPES.filter((x) => x !== "RFI" && x !== "SAFETY_INCIDENT")) expect(await refusal(item(t, { raisedByPersonId: null, raisedBySupplierAccountId: account, ...shared() })), t).toBe("23514 WorkItem_contractor_raises_type");
  });
  it("a defect line is linked to a Defect item only (CHECK; written in 3b-ii)", async () => {
    // The CHECK is judged before the foreign key, so a made-up line id shows it.
    expect(await refusal(item("TASK", { defectItemId: `wis_defect_${randomId()}` }))).toBe("23514 WorkItem_defect_of_type");
  });
});

describe("3b: a comment's writer and audience (B-2, B-8)", () => {
  const comment = (workItemId: string, o: Partial<Record<string, unknown>> = {}) =>
    db.workItemComment.create({ data: { organisationId, workItemId, body: "Bar size confirmed.", personId: raiser, recordedAt: now(), ...o } as Parameters<typeof db.workItemComment.create>[0]["data"] });
  const contractor = () => ({ personId: null, supplierAccountId: account, internal: false });

  it("exactly one writer, and a contractor's comment is never internal (CHECK)", async () => {
    const i = await item("RFI", { sharedAt: now() });
    expect(await refusal(comment(i.id, { supplierAccountId: account, internal: false }))).toBe("23514 WorkItemComment_one_writer");
    expect(await refusal(comment(i.id, { ...contractor(), internal: true }))).toBe("23514 WorkItemComment_contractor_replies");
    expect(await refusal(comment(i.id, contractor()))).toBeNull();
  });

  it("a Reply needs an item shared at or before it; an internal note needs nothing (PA056, the plan's optional backstop)", async () => {
    const unshared = await item("RFI");
    expect(await refusal(comment(unshared.id, { internal: false }))).toBe("PA056");
    expect(await refusal(comment(unshared.id, { internal: true }))).toBeNull();
    const at = now();
    const shared = await item("RFI", { sharedAt: at });
    expect(await refusal(comment(shared.id, { internal: false, recordedAt: new Date(at.getTime() - 1000) }))).toBe("PA056");
    expect(await refusal(comment(shared.id, { internal: false, recordedAt: at }))).toBeNull();
    expect(await refusal(comment(shared.id, { internal: true, recordedAt: new Date(at.getTime() - 1000) }))).toBeNull();
  });
});

describe("3b: a work item's file is kept from withdrawal while pinned (PA047, widened; B-6, WB-4)", () => {
  async function storeVersion(): Promise<string> {
    const bytes = randomBytes(24);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    await db.blobContent.create({ data: { organisationId, sha256, byteSize: BigInt(bytes.length), bytes } });
    const document = await db.document.create({ data: { organisationId, title: "Site photograph", documentClassId, retentionSnapshot: {} } });
    return (await db.documentVersion.create({ data: { organisationId, documentId: document.id, versionNo: 1, sha256, byteSize: BigInt(bytes.length), mediaType: "image/png", originalFilename: "site.png", recordedByPersonId: raiser } })).id;
  }
  const withdraw = (id: string) => db.documentVersion.update({ where: { id }, data: { withdrawnAt: now(), withdrawnReason: "Uploaded to the wrong record" } });

  it("on an unshared or a shared item, a pinned file is refused; once detached (possible on an unshared item only), it may be withdrawn", async () => {
    for (const sharedAt of [null, now()]) {
      const i = await item("TASK", { sharedAt });
      const versionId = await storeVersion();
      const pin = await db.documentAttachment.create({ data: { organisationId, purpose: "WORK_ITEM_FILE", versionId, workItemId: i.id } });
      expect(await refusal(withdraw(versionId)), `shared ${sharedAt != null}`).toBe("PA047");
      const detach = db.documentAttachment.update({ where: { id: pin.id }, data: { detachedAt: now(), detachReason: "Attached to the wrong item" } });
      // WSEC-10 L5: a shared item's pin cannot be detached any more (was: the database allowed it and only the act refused), so the file stays kept.
      if (sharedAt !== null) {
        expect(await refusal(detach)).toBe("PA057");
        expect(await refusal(withdraw(versionId))).toBe("PA047");
      } else {
        expect(await refusal(detach)).toBeNull();
        expect(await refusal(withdraw(versionId))).toBeNull();
      }
    }
  });
});

describe("3b security: the pin on a work item's file is held by the database (WSEC-10 L5; PA057)", () => {
  async function pinned(sharedAt: Date | null) {
    const bytes = randomBytes(24);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    await db.blobContent.create({ data: { organisationId, sha256, byteSize: BigInt(bytes.length), bytes } });
    const document = await db.document.create({ data: { organisationId, title: "Site photograph", documentClassId, retentionSnapshot: {} } });
    const version = await db.documentVersion.create({ data: { organisationId, documentId: document.id, versionNo: 1, sha256, byteSize: BigInt(bytes.length), mediaType: "image/png", originalFilename: "site.png", recordedByPersonId: raiser } });
    const i = await item("TASK", { sharedAt });
    const pin = await db.documentAttachment.create({ data: { organisationId, purpose: "WORK_ITEM_FILE", versionId: version.id, workItemId: i.id, attachedAt: new Date(now().getTime() - 60_000) } });
    return { i, pin };
  }

  it("attachedAt and workItemId never change, on a shared item or an unshared one", async () => {
    for (const sharedAt of [null, now()]) {
      const { i, pin } = await pinned(sharedAt);
      const elsewhere = await item("TASK", { sharedAt });
      const label = `shared ${sharedAt != null}`;
      expect(await refusal(db.documentAttachment.update({ where: { id: pin.id }, data: { attachedAt: new Date() } })), label).toBe("PA057");
      expect(await refusal(db.documentAttachment.update({ where: { id: pin.id }, data: { workItemId: elsewhere.id } })), label).toBe("PA057");
      expect(await refusal(db.$executeRawUnsafe(`UPDATE "DocumentAttachment" SET "attachedAt" = now() WHERE "id" = $1`, pin.id)), label).toBe("PA057");
      const kept = await db.documentAttachment.findUniqueOrThrow({ where: { id: pin.id } });
      expect([kept.workItemId, kept.attachedAt.getTime()], label).toEqual([i.id, pin.attachedAt.getTime()]);
    }
  });

  it("a pin on a shared item is never detached; on an unshared item it is, once, with its reason", async () => {
    const shared = await pinned(now());
    expect(await refusal(db.documentAttachment.update({ where: { id: shared.pin.id }, data: { detachedAt: now(), detachReason: "x" } }))).toBe("PA057");
    expect((await db.documentAttachment.findUniqueOrThrow({ where: { id: shared.pin.id } })).detachedAt).toBeNull();
    const open = await pinned(null);
    expect(await refusal(db.documentAttachment.update({ where: { id: open.pin.id }, data: { detachedAt: now(), detachReason: "Attached to the wrong item" } }))).toBeNull();
  });
});

describe("3b: the Project team (B-12, ADR 0049 D4)", () => {
  const member = (role: string, personId: string) =>
    db.projectTeamMember.create({ data: { organisationId, contractId, role, personId, addedByPersonId: raiser, recordedAt: now() } as Parameters<typeof db.projectTeamMember.create>[0]["data"] });

  it("the enum is the four roles of types.ts", async () => {
    const rows = await db.$queryRawUnsafe<{ v: string }[]>(`SELECT unnest(enum_range(NULL::"ProjectTeamRole"))::text AS v`);
    expect(rows.map((r) => r.v)).toEqual([...TEAM_ROLES]);
  });

  it("one Project manager per contract (partial unique); the same person twice in one role is refused; other roles hold several", async () => {
    const pm = (await makePerson(organisationId, `PM ${randomId()}`)).id;
    const second = (await makePerson(organisationId, `PM2 ${randomId()}`)).id;
    expect(await refusal(member("PROJECT_MANAGER", pm))).toBeNull();
    expect(await refusal(member("PROJECT_MANAGER", second))).toBe("23505");
    expect(await refusal(member("SITE_ENGINEER", pm))).toBeNull();
    expect(await refusal(member("SITE_ENGINEER", pm))).toBe("23505");
    expect(await refusal(member("CONTRACT_ADMINISTRATOR", second))).toBeNull();
    expect(await refusal(member("CONTRACT_ADMINISTRATOR", other))).toBeNull();
    // Removal is a delete (audited by the act): nothing refuses it, and then the next manager may be named.
    await db.projectTeamMember.deleteMany({ where: { contractId, role: "PROJECT_MANAGER" } });
    expect(await refusal(member("PROJECT_MANAGER", second))).toBeNull();
  });
});

describe("3b: the supplier's data export reads its own accounts' items and replies only (plan section 3.1)", () => {
  it("an item it raised and an item it replied on; never an officer's comment, another supplier's reply, or an item it did not raise or reply on", async () => {
    const stranger = (await makeSupplierAccount(organisationId)).account!.id;
    const at = now();
    const say = (workItemId: string, o: Record<string, unknown>) =>
      db.workItemComment.create({ data: { organisationId, workItemId, body: "x", recordedAt: now(), ...o } as Parameters<typeof db.workItemComment.create>[0]["data"] });
    const raised = await item("RFI", { raisedByPersonId: null, raisedBySupplierAccountId: account, sharedAt: at, title: "Raised by the contractor" });
    await say(raised.id, { supplierAccountId: account, internal: false, body: "Own reply" });
    await say(raised.id, { personId: raiser, internal: true, body: "Officer's internal note" });
    await say(raised.id, { personId: raiser, internal: false, body: "Officer's reply" });
    const repliedOn = await item("SITE_INSTRUCTION", { sharedAt: at, title: "Raised by an officer" });
    await say(repliedOn.id, { supplierAccountId: account, internal: false, body: "Own reply on theirs" });
    const strangers = await item("RFI", { sharedAt: at, title: "Another supplier's conversation" });
    await say(strangers.id, { supplierAccountId: stranger, internal: false, body: "Stranger's reply" });
    await item("RFI", { title: "Never shared" });

    const read = await readWorkItems(db, { supplierId, organisationId });
    // Other tests of this file raise and reply as the same account, so only this test's titles are compared; the two that must never come are looked for in the whole read.
    expect(read.map((r) => r.row.title)).not.toContain("Another supplier's conversation");
    expect(read.map((r) => r.row.title)).not.toContain("Never shared");
    const mine = read.filter((r) => r.row.title === "Raised by the contractor" || r.row.title === "Raised by an officer");
    expect(mine.map((r) => [r.row.title, r.raisedByOwnAccount, r.replies.map((c) => c.body)])).toEqual([
      ["Raised by the contractor", true, ["Own reply"]],
      ["Raised by an officer", false, ["Own reply on theirs"]],
    ]);
    // The reader selects the IN columns only: no officer, no status, no answer.
    for (const r of read) expect(Object.keys(r.row).sort()).toEqual(["answer", "description", "dueOn", "happenedAt", "location", "number", "recordedAt", "severity", "sharedAt", "title", "type"]);
  });
});
