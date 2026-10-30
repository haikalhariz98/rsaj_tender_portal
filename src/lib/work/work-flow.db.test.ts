import { createHash } from "node:crypto";

import { beforeAll, describe, expect, it, vi } from "vitest";

import type { Prisma } from "@/generated/prisma/client";
import type { StaffActor } from "@/lib/auth/types";
import { dayToDate } from "@/lib/dates";
import { db } from "@/lib/db";
import { activeContract, contractOrg, form, type TestContract, type TestOrg } from "@/lib/test-db/contract.fixture";
import { makePerson, randomId } from "@/lib/test-db/auth-fixtures";
import type { WrittenAttribution } from "@/lib/test-support/staff";

/**
 * Work items' acts against a real database (workspace 3a step 3): the server actions of `work-actions.ts` through the real `withLockedContract`, `store.ts` and the
 * rules of `src/lib/work`, with the sign-in and the attribution faked as the other action tests fake them. What it holds:
 *  - numbers per contract and type under the contract lock (two raised at once get 1 and 2; another type starts at 1);
 *  - a move from a stale status is refused naming who moved it; a refusal leaves nothing (no row change, no audit row, no notice);
 *  - a terminated contract refuses every act and is still read;
 *  - `workWhere` and `inView` agree on the forty-item fixture for every view and filter, and a `%` or `_` in a search matches itself;
 *  - an attach without the class for project files is refused by name; a link to another contract's item is refused;
 *  - every audit row has its before and after; the notices go to exactly the people the rules name.
 */

const h = vi.hoisted(() => ({ who: null as StaffActor | null, written: [] as WrittenAttribution[] }));

vi.mock("@/app/_auth/actor", async () => {
  const { actorModule } = await import("@/lib/test-support/staff");
  const base = actorModule();
  return { ...base, staffForAct: async () => ({ ok: true as const, actor: h.who! }), requireStaff: async () => h.who! };
});
vi.mock("@/app/_auth/act", async () => {
  const { actModule } = await import("@/lib/test-support/staff");
  const act = actModule();
  h.written = act.written;
  return act.module;
});
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined, updateTag: () => undefined }));

import { attachWorkFiles, commentOnWorkItem, createWorkItem, editWorkField, linkWorkItem, moveWorkItem, unlinkWorkItem, type WorkResult } from "@/app/projects/[id]/work-actions";

import { FIXTURE_ITEMS, FIXTURE_READER, FIXTURE_TODAY } from "./items.fixture";
import { itemRef } from "./number";
import { assigneeOptions, linkOptions, loadActivity, loadBoard, loadItem, loadWorkContext, loadWorkList } from "./load";
import { inView, parseWorkFilters, workWhere, type WorkFilters, type WorkRow } from "./views";
import type { Party, WorkView } from "./types";

let org: TestOrg;
let k: TestContract;
const p = { raiser: "", assignee: "", bystander: "" };
const names: Record<string, string> = {};
let counter = 0;

const as = async <T,>(personId: string, fn: () => Promise<T>): Promise<T> => {
  h.who = org.staff(personId);
  return fn();
};

/// An act is refused with these words, or it answers.
const refused = (r: WorkResult): string => {
  expect(r.refused, "expected a refusal").toBeTruthy();
  return r.refused!;
};
const ok = (r: WorkResult): WorkResult => {
  expect(r.refused, "expected the act to go through").toBeUndefined();
  return r;
};

const raise = (who: string, contractId: string, fields: Record<string, string>) => as(who, () => createWorkItem(form({ contractId, type: "TASK", title: `Task ${++counter}`, ...fields })));
/// Raise a task and read its row.
async function task(who: string, contractId: string, fields: Record<string, string> = {}) {
  const r = ok(await raise(who, contractId, fields));
  return db.workItem.findFirstOrThrow({ where: { contractId, type: "TASK", number: Number(r.ref!.split("-")[1]) } });
}
const move = (who: string, contractId: string, itemId: string, from: string, to: string, extra: Record<string, string> = {}) => as(who, () => moveWorkItem(form({ contractId, itemId, from, to, ...extra })));
const auditOf = (itemId: string) => db.auditEntry.findMany({ where: { organisationId: org.organisationId, entityId: itemId }, orderBy: { at: "asc" } });
const noticesOf = (itemId: string) => db.staffNotice.findMany({ where: { organisationId: org.organisationId, subjectId: itemId }, select: { recipientPersonId: true, kind: true }, orderBy: [{ kind: "asc" }, { recipientPersonId: "asc" }] });

beforeAll(async () => {
  org = await contractOrg("WFL");
  for (const key of Object.keys(p) as (keyof typeof p)[]) {
    names[key] = `${key} ${randomId()}`;
    p[key] = (await makePerson(org.organisationId, names[key])).id;
  }
  k = await activeContract(org);
});

describe("numbers", () => {
  it("two raised at once on one contract get 1 and 2, never the same; another type starts at 1; another contract starts again", async () => {
    const k2 = await activeContract(org);
    const [a, b] = await Promise.all([raise(p.raiser, k2.contractId, { type: "TASK" }), raise(p.raiser, k2.contractId, { type: "TASK" })]);
    expect([ok(a).ref, ok(b).ref].sort()).toEqual(["Task-1", "Task-2"]);
    expect(ok(await raise(p.raiser, k2.contractId, { type: "ACTION" })).ref).toBe("Act-1");
    expect(ok(await raise(p.raiser, k.contractId, { type: "TASK" })).ref).toBe("Task-1");
    // The raising is attributed (Raised by), and the address form of an RFI/SI needs its due day.
    expect(h.written.some((w) => w.entity === "WorkItem" && w.slot === "raisedBy")).toBe(true);
    expect(refused(await raise(p.raiser, k2.contractId, { type: "RFI" }))).toBe("Pick a due date.");
  });

  it("a form that names no type the form offers, or a status nobody offers, is refused whole and writes nothing", async () => {
    const before = await db.workItem.count({ where: { organisationId: org.organisationId } });
    expect(refused(await raise(p.raiser, k.contractId, { type: "EPIC" }))).toMatch(/didn't go through/);
    const t = await task(p.raiser, k.contractId);
    expect(refused(await move(p.raiser, k.contractId, t.id, "TO_DO", "ARCHIVED"))).toMatch(/didn't go through/);
    expect(await db.workItem.count({ where: { organisationId: org.organisationId } })).toBe(before + 1);
  });
});

describe("moving an item", () => {
  it("a move from a stale status is refused, naming who moved it; a refusal leaves no row change, audit row or notice", async () => {
    const t = await task(p.raiser, k.contractId, { assigneePersonId: p.assignee });
    ok(await move(p.assignee, k.contractId, t.id, "TO_DO", "IN_PROGRESS"));
    const audits = (await auditOf(t.id)).length;
    const words = refused(await move(p.raiser, k.contractId, t.id, "TO_DO", "IN_PROGRESS"));
    expect(words).toBe(`${names.assignee} changed this a moment ago.`);
    expect((await auditOf(t.id)).length).toBe(audits);
    expect((await db.workItem.findUniqueOrThrow({ where: { id: t.id } })).status).toBe("IN_PROGRESS");
    // A later edit of another field by someone else does not change who is named as having moved it.
    ok(await as(p.raiser, () => editWorkField(form({ contractId: k.contractId, itemId: t.id, field: "title", value: "Renamed after the move" }))));
    expect(refused(await move(p.bystander, k.contractId, t.id, "TO_DO", "IN_PROGRESS"))).toBe(`${names.assignee} changed this a moment ago.`);
  });

  it("who may move is the move table's: a bystander is told who can, Cancel needs a reason, and Done and Cancelled keep closedAt with the status", async () => {
    const t = await task(p.raiser, k.contractId, { assigneePersonId: p.assignee });
    expect(refused(await move(p.bystander, k.contractId, t.id, "TO_DO", "IN_PROGRESS"))).toMatch(/can start/);
    expect(refused(await move(p.raiser, k.contractId, t.id, "TO_DO", "CANCELLED"))).toBe("Give a reason.");
    expect((await db.workItem.findUniqueOrThrow({ where: { id: t.id } })).status).toBe("TO_DO");
    ok(await move(p.raiser, k.contractId, t.id, "TO_DO", "CANCELLED", { reason: "Raised twice" }));
    const gone = await db.workItem.findUniqueOrThrow({ where: { id: t.id } });
    expect([gone.status, gone.cancelReason, gone.closedAt !== null]).toEqual(["CANCELLED", "Raised twice", true]);
    // A closed item is read only until reopened; reopening clears closedAt.
    expect(refused(await as(p.raiser, () => editWorkField(form({ contractId: k.contractId, itemId: t.id, field: "title", value: "Renamed" }))))).toBe("Reopen it first.");
    ok(await move(p.raiser, k.contractId, t.id, "CANCELLED", "TO_DO"));
    expect((await db.workItem.findUniqueOrThrow({ where: { id: t.id } })).closedAt).toBeNull();
  });

  it("review tells the raiser; send back needs a comment, writes it in the same act (internal, attributed) and tells the assignee", async () => {
    const t = await task(p.raiser, k.contractId, { assigneePersonId: p.assignee });
    ok(await move(p.assignee, k.contractId, t.id, "TO_DO", "IN_REVIEW"));
    expect(await noticesOf(t.id)).toEqual([
      { recipientPersonId: p.assignee, kind: "WORK_ITEM_ASSIGNED" },
      { recipientPersonId: p.raiser, kind: "WORK_ITEM_TO_CHECK" },
    ]);
    expect(refused(await move(p.raiser, k.contractId, t.id, "IN_REVIEW", "IN_PROGRESS"))).toBe("Say what to change.");
    expect((await db.workItem.findUniqueOrThrow({ where: { id: t.id } })).status).toBe("IN_REVIEW");
    ok(await move(p.raiser, k.contractId, t.id, "IN_REVIEW", "IN_PROGRESS", { comment: "Photograph the joint" }));
    const comments = await db.workItemComment.findMany({ where: { workItemId: t.id } });
    expect(comments.map((c) => [c.body, c.internal, c.personId])).toEqual([["Photograph the joint", true, p.raiser]]);
    expect(h.written.some((w) => w.entity === "WorkItemComment" && w.entityId === comments[0].id)).toBe(true);
    expect((await noticesOf(t.id)).filter((n) => n.kind === "WORK_ITEM_RETURNED")).toEqual([{ recipientPersonId: p.assignee, kind: "WORK_ITEM_RETURNED" }]);
  });
});

describe("editing, commenting and who is told", () => {
  it("a field is edited by the raiser, assignee or lead only; a no-change edit writes no audit row; assigning tells the assignee, assigning yourself tells nobody", async () => {
    const t = await task(p.raiser, k.contractId);
    expect(refused(await as(p.bystander, () => editWorkField(form({ contractId: k.contractId, itemId: t.id, field: "priority", value: "HIGH" }))))).toMatch(/can edit/);
    ok(await as(p.raiser, () => editWorkField(form({ contractId: k.contractId, itemId: t.id, field: "priority", value: "HIGH" }))));
    const audits = (await auditOf(t.id)).length;
    ok(await as(p.raiser, () => editWorkField(form({ contractId: k.contractId, itemId: t.id, field: "priority", value: "HIGH" }))));
    expect((await auditOf(t.id)).length).toBe(audits);
    ok(await as(p.raiser, () => editWorkField(form({ contractId: k.contractId, itemId: t.id, field: "assigneePersonId", value: p.assignee }))));
    ok(await as(p.raiser, () => editWorkField(form({ contractId: k.contractId, itemId: t.id, field: "assigneePersonId", value: p.raiser }))));
    expect(await noticesOf(t.id)).toEqual([{ recipientPersonId: p.assignee, kind: "WORK_ITEM_ASSIGNED" }]);
  });

  it("an inactive person, or one of another organisation, is not an eligible assignee", async () => {
    const t = await task(p.raiser, k.contractId);
    const gone = (await makePerson(org.organisationId, `Gone ${randomId()}`)).id;
    await db.person.update({ where: { id: gone }, data: { isActive: false } });
    const stranger = (await makePerson((await db.organisation.create({ data: { code: `WFO_${randomId()}`, name: "Another" } })).id)).id;
    for (const id of [gone, stranger]) expect(refused(await as(p.raiser, () => editWorkField(form({ contractId: k.contractId, itemId: t.id, field: "assigneePersonId", value: id }))))).toBe("Pick someone active who can see this contract.");
  });

  it("a comment tells the raiser and the assignee but not the writer, once each; it is internal and attributed", async () => {
    const t = await task(p.raiser, k.contractId, { assigneePersonId: p.assignee });
    ok(await as(p.bystander, () => commentOnWorkItem(form({ contractId: k.contractId, itemId: t.id, body: "Is this still needed?" }))));
    ok(await as(p.raiser, () => commentOnWorkItem(form({ contractId: k.contractId, itemId: t.id, body: "Yes." }))));
    const told = (await noticesOf(t.id)).filter((n) => n.kind === "WORK_ITEM_COMMENT").map((n) => n.recipientPersonId);
    expect(told.filter((id) => id === p.raiser).length).toBe(1);
    expect(told.filter((id) => id === p.assignee).length).toBe(2);
    expect(told.length).toBe(3);
    expect((await db.workItemComment.findMany({ where: { workItemId: t.id } })).every((c) => c.internal)).toBe(true);
    expect(refused(await as(p.raiser, () => commentOnWorkItem(form({ contractId: k.contractId, itemId: t.id, body: "  " }))))).toBe("Write a comment first.");
  });
});

describe("links", () => {
  it("a link to an item or document of another contract is refused; one way only; unlink is audited with what it linked", async () => {
    const other = await activeContract(org);
    const a = await task(p.raiser, k.contractId);
    const b = await task(p.raiser, k.contractId);
    const foreign = await task(p.raiser, other.contractId);
    const foreignDoc = await db.projectDocument.create({ data: { organisationId: org.organisationId, contractId: other.contractId, title: "Elsewhere", side: "ORGANISATION", createdByPersonId: p.raiser, createdAt: new Date() } });
    const at = (fields: Record<string, string>) => as(p.raiser, () => linkWorkItem(form({ contractId: k.contractId, itemId: a.id, ...fields })));
    expect(refused(await at({ toItemId: foreign.id }))).toBe("That is on another contract.");
    expect(refused(await at({ documentId: foreignDoc.id }))).toBe("That is on another contract.");
    ok(await at({ toItemId: b.id }));
    expect(refused(await at({ toItemId: b.id }))).toBe("Already linked.");
    expect(refused(await as(p.raiser, () => linkWorkItem(form({ contractId: k.contractId, itemId: b.id, toItemId: a.id }))))).toBe("Already linked.");
    const row = await db.workItemLink.findFirstOrThrow({ where: { workItemId: a.id } });
    expect(h.written.some((w) => w.entity === "WorkItemLink" && w.entityId === row.id)).toBe(true);
    ok(await as(p.raiser, () => unlinkWorkItem(form({ contractId: k.contractId, itemId: b.id, linkId: row.id }))));
    // Audited on both ends, so each item's Activity shows it: a create and a delete under A's label and under B's, each naming the other.
    const trail = (await db.auditEntry.findMany({ where: { entity: "WorkItemLink", entityId: row.id }, orderBy: [{ at: "asc" }, { entityLabel: "asc" }] })).map((e) => [e.action, JSON.stringify(e.changes), e.entityLabel]);
    expect(trail.map((t) => t[0]).sort()).toEqual(["CREATE", "CREATE", "DELETE", "DELETE"]);
    const del = trail.filter((t) => t[0] === "DELETE");
    expect(del.some((t) => t[2].includes(itemRef("TASK", b.number) + " ·") && t[1].includes(itemRef("TASK", a.number)))).toBe(true);
    expect(del.some((t) => t[2].includes(itemRef("TASK", a.number) + " ·") && t[1].includes(itemRef("TASK", b.number)))).toBe(true);
  });
});

describe("a terminated contract", () => {
  it("refuses every act, changes nothing, and is still read", async () => {
    const ended = await activeContract(org);
    const t = await task(p.raiser, ended.contractId, { assigneePersonId: p.assignee });
    const mate = await task(p.raiser, ended.contractId);
    await db.contract.update({ where: { id: ended.contractId }, data: { status: "TERMINATED" } });
    const c = ended.contractId;
    const attempts: WorkResult[] = [
      await raise(p.raiser, c, {}),
      await as(p.raiser, () => editWorkField(form({ contractId: c, itemId: t.id, field: "title", value: "Late edit" }))),
      await move(p.assignee, c, t.id, "TO_DO", "IN_PROGRESS"),
      await as(p.raiser, () => commentOnWorkItem(form({ contractId: c, itemId: t.id, body: "Hello" }))),
      await as(p.raiser, () => linkWorkItem(form({ contractId: c, itemId: t.id, toItemId: mate.id }))),
      await as(p.raiser, () => unlinkWorkItem(form({ contractId: c, itemId: t.id, linkId: "none" }))),
      await as(p.raiser, () => attachWorkFiles(form({ contractId: c, itemId: t.id, stagedVersionId: "none" }))),
    ];
    for (const r of attempts) expect(r.refused).toBeTruthy();
    expect(await db.workItem.count({ where: { contractId: c } })).toBe(2);
    expect((await db.workItem.findUniqueOrThrow({ where: { id: t.id } })).status).toBe("TO_DO");
    expect(await db.workItemComment.count({ where: { workItemId: t.id } })).toBe(0);
    // Reading still works, and says the tab is closed.
    const read = (await loadWorkContext({ organisationId: org.organisationId, contractId: c, now: new Date() }))!;
    expect(read.context.open).toBe(false);
    const list = await loadWorkList({ organisationId: org.organisationId, contractId: c, viewerId: p.raiser, view: "open", filters: {}, today: read.context.today, timeZone: read.context.timeZone, page: 0, size: 25 });
    expect(list.total).toBe(2);
    expect(await loadItem({ organisationId: org.organisationId, contractId: c, ref: itemRef("TASK", t.number), timeZone: read.context.timeZone })).not.toBeNull();
  });

  it("an act naming an item of another contract is refused as not found, and locks and changes nothing", async () => {
    const other = await activeContract(org);
    const foreign = await task(p.raiser, other.contractId);
    const words = refused(await as(p.raiser, () => editWorkField(form({ contractId: k.contractId, itemId: foreign.id, field: "title", value: "Hijacked" }))));
    expect(words).toBe("That item no longer exists.");
    expect(refused(await move(p.raiser, k.contractId, foreign.id, "TO_DO", "IN_PROGRESS"))).toBe("That item no longer exists.");
    expect((await db.workItem.findUniqueOrThrow({ where: { id: foreign.id } })).title).toBe(foreign.title);
    expect(refused(await as(p.raiser, () => editWorkField(form({ contractId: "no-such-contract", itemId: foreign.id, field: "title", value: "x" }))))).toBe("That contract no longer exists.");
  });

  it("an address that names an item of another contract, or of nobody, reads as nothing", async () => {
    const t = await task(p.raiser, k.contractId);
    const other = await activeContract(org);
    expect(await loadItem({ organisationId: org.organisationId, contractId: other.contractId, ref: itemRef("TASK", t.number), timeZone: null })).toBeNull();
    expect(await loadItem({ organisationId: org.organisationId, contractId: k.contractId, ref: "Task-99999", timeZone: null })).toBeNull();
    expect(await loadItem({ organisationId: org.organisationId, contractId: k.contractId, ref: "task-1", timeZone: null })).toBeNull();
    // Another organisation's reader asks the same address and finds nothing.
    expect(await loadItem({ organisationId: "another", contractId: k.contractId, ref: itemRef("TASK", t.number), timeZone: null })).toBeNull();
  });
});

describe("files", () => {
  const stage = async (classId: string, by: string, stagedFor = "work-item") => {
    const bytes = new TextEncoder().encode(`%PDF-1.4 work ${randomId()} ${++counter}`);
    const sha = createHash("sha256").update(bytes).digest("hex");
    await db.blobContent.createMany({ data: [{ organisationId: org.organisationId, sha256: sha, byteSize: BigInt(bytes.length), bytes, storedAt: new Date() }], skipDuplicates: true });
    const name = `drawing-${counter}.pdf`;
    const doc = await db.document.create({ data: { organisationId: org.organisationId, title: name, documentClassId: classId, classificationSnapshot: "INTERNAL", retentionSnapshot: {}, stagedFor } });
    return (await db.documentVersion.create({ data: { organisationId: org.organisationId, documentId: doc.id, versionNo: 1, sha256: sha, byteSize: BigInt(bytes.length), mediaType: "application/pdf", originalFilename: name, recordedByPersonId: by, storedAt: new Date() } })).id;
  };

  it("attaching without the class for project files is refused by name; with it, a staged file is pinned and filed, and the audit shows it", async () => {
    const t = await task(p.raiser, k.contractId);
    const klass = await db.documentClass.create({ data: { organisationId: org.organisationId, code: `wfl_${randomId()}`, nameEn: "Project files", classification: "INTERNAL" } });
    const first = await stage(klass.id, p.raiser);
    const attach = (who: string, ...ids: string[]) => as(who, () => attachWorkFiles(form({ contractId: k.contractId, itemId: t.id, stagedVersionId: ids })));
    expect(refused(await attach(p.raiser, first))).toMatch(/Project files have no document class yet/);

    await db.documentStorePolicy.upsert({ where: { organisationId: org.organisationId }, update: { projectDocumentClassId: klass.id }, create: { organisationId: org.organisationId, allowedMediaTypes: ["application/pdf"], maxBytes: BigInt(10_000_000), projectDocumentClassId: klass.id } });
    // Someone else's staged file, or one staged for something else, reads as not found.
    expect(refused(await attach(p.bystander, first))).toMatch(/File 1 was not found/);
    expect(refused(await attach(p.raiser, await stage(klass.id, p.raiser, "project-document")))).toMatch(/File 1 was not found/);
    expect((await db.documentAttachment.count({ where: { workItemId: t.id } }))).toBe(0);

    ok(await attach(p.raiser, first));
    const pinned = await db.documentAttachment.findMany({ where: { workItemId: t.id }, include: { version: { include: { document: true } } } });
    expect(pinned.map((a) => [a.purpose, a.version.document.status])).toEqual([["WORK_ITEM_FILE", "FILED"]]);
    expect(refused(await attach(p.raiser, first))).toMatch(/already attached/);
    const detail = (await loadItem({ organisationId: org.organisationId, contractId: k.contractId, ref: itemRef("TASK", t.number), timeZone: null }))!;
    expect(detail.files.map((f) => f.filename)).toEqual([pinned[0].version.originalFilename]);
    const activity = await loadActivity({ organisationId: org.organisationId, contractId: k.contractId, contractNumber: (await db.contract.findUniqueOrThrow({ where: { id: k.contractId } })).number, item: t, timeZone: null });
    expect(activity.some((l) => l.kind === "CHANGE" && l.text === "added a file")).toBe(true);
  });
});

describe("the audit trail and the readers", () => {
  it("every audit row of an item has its before and after, and none starts with the case History's prefix", async () => {
    const rows = await db.auditEntry.findMany({ where: { organisationId: org.organisationId, entityLabel: { startsWith: "Work item " } } });
    expect(rows.length).toBeGreaterThan(20);
    for (const r of rows) {
      const changes = r.changes as unknown as { field: string; before: string | null; after: string | null }[];
      expect(changes.length, `${r.entity} ${r.action}`).toBeGreaterThan(0);
      for (const c of changes) {
        if (r.action === "UPDATE") expect(c.before !== c.after, `${r.entity}.${c.field}`).toBe(true);
        else if (r.action === "CREATE") expect(c.after, `${r.entity}.${c.field}`).not.toBeNull();
        else expect(c.before, `${r.entity}.${c.field}`).not.toBeNull();
        expect(Object.keys(c).sort()).toEqual(["after", "before", "field"]);
      }
      expect(r.entityLabel.startsWith("Contract ")).toBe(false);
    }
    expect(rows.some((r) => r.action === "DELETE")).toBe(true);
    expect(rows.filter((r) => r.entity === "WorkItem" && r.action === "CREATE").length).toBeGreaterThan(5);
  });

  it("the pickers: the organisation's active people; the contract's other items and documents", async () => {
    const people = await assigneeOptions({ organisationId: org.organisationId });
    expect(people.map((x) => x.value)).toEqual(expect.arrayContaining([p.raiser, p.assignee]));
    const opts = await linkOptions({ organisationId: org.organisationId, contractId: k.contractId });
    expect(opts.items.length).toBeGreaterThan(3);
    expect(opts.items[0].label).toMatch(/^[A-Za-z]+ \d+ · /);
  });
});

describe("the views: workWhere against the database agrees with inView", () => {
  const person: Record<string, string> = {};
  let fixtureContract: TestContract;
  const keyOf = new Map<string, string>(); // title -> fixture id
  /// The forty are all staff: a fixture person's seeded id.
  const idOf = (p: Party | null): string | null => (p?.kind === "PERSON" ? person[p.id] : null);

  beforeAll(async () => {
    for (const n of ["aisyah", "hafiz", "nurul"]) person[n] = (await makePerson(org.organisationId, `${n} ${randomId()}`)).id;
    fixtureContract = await activeContract(org);
    for (const i of FIXTURE_ITEMS) {
      const closed = i.status === "DONE" || i.status === "CANCELLED";
      keyOf.set(i.title, i.id);
      await db.workItem.create({
        data: {
          organisationId: org.organisationId,
          contractId: fixtureContract.contractId,
          type: i.type,
          number: i.number,
          title: i.title,
          status: i.status,
          priority: i.priority,
          dueOn: i.dueOn ? dayToDate(i.dueOn) : null,
          raisedByPersonId: idOf(i.raisedBy)!,
          assigneePersonId: idOf(i.assignee),
          answer: i.answer,
          inspectionResult: i.inspectionResult,
          severity: i.type === "SAFETY_INCIDENT" ? "NEAR_MISS" : null,
          happenedAt: i.type === "SAFETY_INCIDENT" ? new Date() : null,
          cancelReason: i.status === "CANCELLED" ? "Withdrawn" : "",
          closedAt: closed && i.closedOn ? dayToDate(i.closedOn) : closed ? new Date() : null,
          recordedAt: new Date(),
        },
      });
    }
    // Titles that carry the characters a LIKE would take for wildcards, and a decoy each would wrongly match.
    for (const [n, title] of [["100", "100% done"], ["101", "a_b joint"], ["102", "aXb joint"], ["103", "100 done"]] as const) {
      await db.workItem.create({ data: { organisationId: org.organisationId, contractId: fixtureContract.contractId, type: "TASK", number: Number(n), title, raisedByPersonId: person.hafiz, recordedAt: new Date() } });
    }
  });

  const asRow = (i: (typeof FIXTURE_ITEMS)[number]): WorkRow => ({ ...i, raisedBy: { kind: "PERSON", id: idOf(i.raisedBy)! }, assignee: i.assignee ? { kind: "PERSON", id: idOf(i.assignee)! } : null });
  const FILTERS: WorkFilters[] = [{}, { type: "RFI" }, { type: "TASK", priority: "HIGH" }, { assignee: "aisyah" }, { priority: "URGENT" }, { q: "cracked" }, { q: "block b", type: "DEFECT" }, { q: "rfi 1" }, { q: "SI-2" }, { q: "no such title" }];
  const VIEWS: WorkView[] = ["open", "mine", "late", "unassigned", "ncr", "done"];

  it("every view and filter on the forty-item fixture returns the items inView keeps", async () => {
    let compared = 0;
    for (const view of VIEWS) {
      for (const f of FILTERS) {
        const filters = { ...f, assignee: f.assignee ? person[f.assignee] : f.assignee };
        const where = { organisationId: org.organisationId, contractId: fixtureContract.contractId, ...workWhere(view, filters, { personId: person[FIXTURE_READER] }, FIXTURE_TODAY) } as Prisma.WorkItemWhereInput;
        const inDb = (await db.workItem.findMany({ where, select: { title: true } })).map((r) => r.title).filter((t) => keyOf.has(t)).sort();
        const inMemory = FIXTURE_ITEMS.filter((i) => inView(asRow(i), view, { personId: person[FIXTURE_READER] }, FIXTURE_TODAY, filters)).map((i) => i.title).sort();
        expect(inDb, `${view} ${JSON.stringify(f)}`).toEqual(inMemory);
        compared += inMemory.length;
      }
    }
    expect(compared).toBeGreaterThan(100);
  });

  it("Late with no time zone matches nothing", async () => {
    const where = { organisationId: org.organisationId, contractId: fixtureContract.contractId, ...workWhere("late", {}, { personId: person.aisyah }, null) } as Prisma.WorkItemWhereInput;
    expect(await db.workItem.count({ where })).toBe(0);
  });

  it("a % or _ in a search matches itself, not any text", async () => {
    const find = async (q: string) => {
      const where = { organisationId: org.organisationId, contractId: fixtureContract.contractId, ...workWhere("open", parseWorkFilters({ q }), { personId: person.aisyah }, FIXTURE_TODAY) } as Prisma.WorkItemWhereInput;
      return (await db.workItem.findMany({ where, select: { title: true } })).map((r) => r.title).sort();
    };
    expect(await find("%")).toEqual(["100% done"]);
    expect(await find("a_b")).toEqual(["a_b joint"]);
    expect(await find("_")).toEqual(["a_b joint"]);
  });

  it("the list pages and orders as the rules say, and the board's counts are the database's", async () => {
    const base = { organisationId: org.organisationId, contractId: fixtureContract.contractId, viewerId: person.aisyah, today: FIXTURE_TODAY, timeZone: "Asia/Kuala_Lumpur" };
    const all = await loadWorkList({ ...base, view: "open", filters: {}, page: 0, size: 1000 });
    const first = await loadWorkList({ ...base, view: "open", filters: {}, page: 0, size: 10 });
    const last = await loadWorkList({ ...base, view: "open", filters: {}, page: 99, size: 10 });
    expect(first.rows.map((r) => r.id)).toEqual(all.rows.slice(0, 10).map((r) => r.id));
    expect(last.page).toBe(Math.ceil(all.total / 10) - 1);
    expect(last.rows.map((r) => r.id)).toEqual(all.rows.slice(last.page * 10).map((r) => r.id));
    // Late first: every row due before today comes before every row that is not.
    const dues = all.rows.map((r) => r.dueOn);
    expect(dues.slice(0, dues.findIndex((d) => d === null))).toEqual([...dues.slice(0, dues.findIndex((d) => d === null))].sort());
    const board = await loadBoard({ ...base, view: "open", filters: {} });
    expect(board.map((c) => c.column)).toEqual(["TO_DO", "IN_PROGRESS", "IN_REVIEW", "DONE"]);
    expect(board[0].total).toBe(FIXTURE_ITEMS.filter((i) => i.status === "TO_DO").length + 4); // the four extra tasks are To do
    expect(board.every((c) => c.items.length <= 50)).toBe(true);
    for (const c of board.slice(0, 3)) expect(c.items.every((i) => i.status === c.column)).toBe(true);
  });
});
