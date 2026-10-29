import { beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { ATTACHMENT_PURPOSES, OWNER_COLUMN, OWNER_KINDS, purposeOwners } from "@/lib/documents/types";
import { STAFF_NOTICE_KINDS } from "@/lib/inbox/kinds";
import { makePerson, makeSupplierAccount, randomId, testOrganisation } from "@/lib/test-db/auth-fixtures";

import { LOCATION_MAX, TEXT_MAX, TITLE_MAX } from "./bounds";
import { WORK_ITEM_TYPES, type WorkItemType } from "./types";

/**
 * What the database itself holds of work items (workspace 3a plan section 3.1, step 1), against migrations 20261210000800 and 20261210000900. The acts
 * (step 3) judge first; these are the backstops, for every login. Each refusal is told apart by its SQLSTATE and, for a CHECK, by the constraint's name, so
 * a row refused by another CHECK than the one under test fails the test: 23514 a CHECK, 23505 a unique key, PA001 the trail's append-only refusal.
 */

let organisationId: string;
let contractId: string;
let raiser: string;
let other: string;
let account: string;
let projectDocumentId: string;

/// "23514 WorkItem_title_present", "23505", "PA001": the SQLSTATE, and the constraint's name where the database gave one.
function refusalOf(error: unknown): string {
  const e = error as { code?: string; message?: string; meta?: { driverAdapterError?: { cause?: { originalCode?: string; code?: string; kind?: string; constraint?: unknown } } } };
  const cause = e.meta?.driverAdapterError?.cause;
  const code = cause?.originalCode ?? (e.code === "P2002" ? "23505" : (cause?.code ?? cause?.kind ?? `not a database refusal: ${String(error).slice(0, 300)}`));
  if (code !== "23514") return code;
  const name = /"?((?:WorkItem|WorkItemComment|WorkItemLink|DocumentAttachment|StaffNotice)_[a-z_]+)"?/.exec(`${JSON.stringify(cause)} ${e.message ?? ""}`)?.[1];
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
  const run = randomId();
  const requisition = await db.requisition.create({
    data: { organisationId, reference: `WIS/RQ/${run}`, requestingUnitCode: "WIS_DEPT", requestingPersonId: raiser, title: "Work items requisition", justification: "Tests.", needStatement: "None.", costCentreCode: "WIS_CC", accountCode: "WIS_AC", placeOfDelivery: "Nowhere", dateRequired: DAY, estimatedValue: "100000.00", raisedOn: DAY },
  });
  const exercise = await db.sourcingExercise.create({ data: { organisationId, reference: `WIS/EX/${run}`, requisitionId: requisition.id, title: `Drainage ${run}`, estimatedValue: "100000.00", sourcingMethodCode: "WIS_METHOD", status: "EVALUATED" } });
  const award = await db.award.create({ data: { organisationId, reference: `WIS/AW/${run}`, exerciseId: exercise.id, instrumentKind: "WORK_INDENT", awardeeName: "A Contractor", awardedValue: "100000.00", completionPeriod: 90, completionUnit: "DAYS", status: "ISSUED", vendorId: contractor.supplier.id } });
  contractId = (await db.contract.create({ data: { organisationId, number: `WIS/CON/${run}`, numberSource: "SERIES", numberedOn: DAY, awardId: award.id, contractSum: "100000.00", status: "ACTIVE" } })).id;
  projectDocumentId = (await db.projectDocument.create({ data: { organisationId, contractId, title: "Drainage layout", side: "ORGANISATION", createdByPersonId: raiser, createdAt: now() } })).id;
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
    expect(await refusal(item("TASK", { raisedByPersonId: null }))).toBe("23514 WorkItem_raised_by_person");
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

  it("at most one assignee: a person or the contractor's account, never both", async () => {
    expect(await refusal(item("TASK", { assigneePersonId: other, assigneeSupplierAccountId: account }))).toBe("23514 WorkItem_one_assignee");
    expect(await refusal(item("TASK", { assigneePersonId: other }))).toBeNull();
    expect(await refusal(item("TASK", { assigneeSupplierAccountId: account }))).toBeNull();
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
    expect(await refusal(comment(i.id, { personId: null }))).toBe("23514 WorkItemComment_by_person");
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
    for (const kind of ["WORK_ITEM_ASSIGNED", "WORK_ITEM_TO_CHECK", "WORK_ITEM_RETURNED", "WORK_ITEM_COMMENT"] as const) {
      expect(STAFF_NOTICE_KINDS).toContain(kind);
      expect(await refusal(db.staffNotice.create({ data: { organisationId, recipientPersonId: raiser, kind, subjectEntity: "WorkItem", subjectId: `wis_${randomId()}`, occurrence: `wis_${randomId()}`, title: "RFI 1", body: "RFI 1 · A title" } })), kind).toBeNull();
    }
    expect(await refusal(db.staffNotice.create({ data: { organisationId, recipientPersonId: raiser, kind: "WORK_ITEM_DUE_TOMORROW", subjectEntity: "WorkItem", subjectId: `wis_${randomId()}`, title: "x", body: "x" } }))).toBe("23514 StaffNotice_kind_known");
  });
});
