import { createHash } from "node:crypto";

import { beforeAll, describe, expect, it, vi } from "vitest";

import type { Prisma } from "@/generated/prisma/client";
import type { StaffActor } from "@/lib/auth/types";
import { dayToDate } from "@/lib/dates";
import { db } from "@/lib/db";
import { activeContract, contractOrg, form, type TestContract, type TestOrg } from "@/lib/test-db/contract.fixture";
import { makePerson, makeSupplierAccount, randomId } from "@/lib/test-db/auth-fixtures";
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

import { attachWorkFiles, commentOnWorkItem, createWorkItem, editWorkField, linkWorkItem, moveWorkItem, removeWorkFile, shareWorkItem, unlinkWorkItem, type WorkResult } from "@/app/projects/[id]/work-actions";
import { addTeamMemberAction, changeProjectManagerAction, removeTeamMemberAction, type TeamResult } from "@/app/projects/[id]/team-actions";

import { portalSeesFile } from "./audience";
import { FIXTURE_CONTRACTOR_ITEMS, FIXTURE_ITEMS, FIXTURE_READER, FIXTURE_TODAY } from "./items.fixture";
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
/// What the page would have drawn (WSEC-1): the share state the item holds now, as the form posts it. A test that wants a stale page passes its own.
const seen = async (itemId: string): Promise<string> => ((await db.workItem.findUniqueOrThrow({ where: { id: itemId } })).sharedAt ? "yes" : "no");
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

  // Replaced for 3b step 3 (not a weakening): step 2 held that NO staff form could share, until the audited share existed. It exists now, so the positive tests below
  // (the describe "3b step 3: sharing") hold what the share does, and the bound that mattered stays: quick add and a plain create never share.
  it("a plain create, and the quick-add row, never share an item", async () => {
    const t = await task(p.raiser, k.contractId);
    expect(t.sharedAt).toBeNull();
    expect(await db.workItem.findUniqueOrThrow({ where: { id: t.id }, select: { sharedAt: true, assignedToContractor: true } })).toEqual({ sharedAt: null, assignedToContractor: false });
  });

  it("a comment tells the raiser and the assignee but not the writer, once each; it is internal and attributed", async () => {
    const t = await task(p.raiser, k.contractId, { assigneePersonId: p.assignee });
    ok(await as(p.bystander, async () => commentOnWorkItem(form({ contractId: k.contractId, itemId: t.id, body: "Is this still needed?", expectedShared: await seen(t.id) }))));
    ok(await as(p.raiser, async () => commentOnWorkItem(form({ contractId: k.contractId, itemId: t.id, body: "Yes.", expectedShared: await seen(t.id) }))));
    const told = (await noticesOf(t.id)).filter((n) => n.kind === "WORK_ITEM_COMMENT").map((n) => n.recipientPersonId);
    expect(told.filter((id) => id === p.raiser).length).toBe(1);
    expect(told.filter((id) => id === p.assignee).length).toBe(2);
    expect(told.length).toBe(3);
    expect((await db.workItemComment.findMany({ where: { workItemId: t.id } })).every((c) => c.internal)).toBe(true);
    expect(refused(await as(p.raiser, async () => commentOnWorkItem(form({ contractId: k.contractId, itemId: t.id, body: "  ", expectedShared: await seen(t.id) }))))).toBe("Write a comment first.");
  });
});

const edit = (who: string, itemId: string, field: string, value: string) => as(who, () => editWorkField(form({ contractId: k.contractId, itemId, field, value })));
const shareAs = (who: string, itemId: string, share = "on") => as(who, () => shareWorkItem(form({ contractId: k.contractId, itemId, share })));
const say = (who: string, itemId: string, body: string, audience?: string, expectedShared?: string) =>
  as(who, async () => commentOnWorkItem(form({ contractId: k.contractId, itemId, body, expectedShared: expectedShared ?? (await seen(itemId)), ...(audience ? { audience } : {}) })));
const itemRow = (id: string) => db.workItem.findUniqueOrThrow({ where: { id } });

describe("3b step 3: sharing", () => {
  it("the share is one-way and audited as sharedAt: none to the instant; sharing a shared item writes nothing; asking to unshare says it can't be undone", async () => {
    const t = await task(p.raiser, k.contractId, { assigneePersonId: p.assignee });
    expect(refused(await shareAs(p.bystander, t.id))).toMatch(/can edit/);
    expect((await itemRow(t.id)).sharedAt).toBeNull();
    expect(refused(await shareAs(p.raiser, t.id, "maybe"))).toMatch(/didn't go through/);
    // "Not shared" asked of an unshared item asks nothing and writes nothing.
    const before = (await auditOf(t.id)).length;
    ok(await shareAs(p.raiser, t.id, "off"));
    expect((await auditOf(t.id)).length).toBe(before);

    ok(await shareAs(p.raiser, t.id));
    const shared = (await itemRow(t.id)).sharedAt!;
    expect(shared).not.toBeNull();
    const trail = await auditOf(t.id);
    expect(trail.at(-1)!.changes).toEqual([{ field: "sharedAt", before: null, after: shared.toISOString() }]);
    // Again: the same instant, no new row.
    ok(await shareAs(p.assignee, t.id));
    expect((await itemRow(t.id)).sharedAt).toEqual(shared);
    expect((await auditOf(t.id)).length).toBe(trail.length);
    expect(refused(await shareAs(p.raiser, t.id, "off"))).toBe("Sharing can't be undone.");
    expect((await itemRow(t.id)).sharedAt).toEqual(shared);
    // The database holds it too: nothing clears it.
    await expect(db.workItem.update({ where: { id: t.id }, data: { sharedAt: null } })).rejects.toThrow();
  });

  it("two people sharing at once share it once: one instant, one audit row (the item's row lock)", async () => {
    const t = await task(p.raiser, k.contractId, { assigneePersonId: p.assignee });
    const [a, b] = await Promise.all([shareAs(p.raiser, t.id), shareAs(p.assignee, t.id)]);
    ok(a);
    ok(b);
    expect((await auditOf(t.id)).filter((e) => (e.changes as { field: string }[]).some((c) => c.field === "sharedAt")).length).toBe(1);
  });

  it("a share is refused on a closed item, and on another contract's item as not found", async () => {
    const t = await task(p.raiser, k.contractId);
    ok(await move(p.raiser, k.contractId, t.id, "TO_DO", "CANCELLED", { reason: "No longer needed" }));
    expect(refused(await shareAs(p.raiser, t.id))).toBe("Reopen it first.");
    const other = await activeContract(org);
    const foreign = await task(p.raiser, other.contractId);
    expect(refused(await shareAs(p.raiser, foreign.id))).toBe("That item no longer exists.");
    expect((await itemRow(foreign.id)).sharedAt).toBeNull();
  });

  it("creating with the toggle on, or assigned to the contractor, shares at creation and says so in the create row", async () => {
    const a = await task(p.raiser, k.contractId, { share: "on" });
    expect([a.sharedAt !== null, a.assignedToContractor]).toEqual([true, false]);
    const b = await task(p.raiser, k.contractId, { assigneePersonId: "contractor" });
    expect([b.sharedAt !== null, b.assignedToContractor, b.assigneePersonId]).toEqual([true, true, null]);
    const create = (await auditOf(b.id)).find((e) => e.action === "CREATE")!;
    const changes = create.changes as { field: string; after: string | null }[];
    expect(changes.find((c) => c.field === "assigneePersonId")?.after).toBe("contractor");
    expect(changes.find((c) => c.field === "sharedAt")?.after).toBe(b.sharedAt!.toISOString());
    // The contractor is told nothing (PW-13): no notice for it, and no person to tell.
    expect(await noticesOf(b.id)).toEqual([]);
  });

  it("assigning to the contractor shares in the same write, as ONE Assignee line beside the share; back to a person is one line and keeps it shared; the same again writes nothing", async () => {
    const t = await task(p.raiser, k.contractId, { assigneePersonId: p.assignee });
    expect(t.sharedAt).toBeNull();
    const told = (await noticesOf(t.id)).length;
    ok(await edit(p.raiser, t.id, "assigneePersonId", "contractor"));
    const row = await itemRow(t.id);
    expect([row.assignedToContractor, row.assigneePersonId, row.sharedAt !== null]).toEqual([true, null, true]);
    const trail = await auditOf(t.id);
    expect(trail.at(-1)!.changes).toEqual([
      { field: "assigneePersonId", before: p.assignee, after: "contractor" },
      { field: "sharedAt", before: null, after: row.sharedAt!.toISOString() },
    ]);
    expect((await noticesOf(t.id)).length).toBe(told);
    // Contractor to contractor: no write, no row.
    ok(await edit(p.raiser, t.id, "assigneePersonId", "contractor"));
    expect((await auditOf(t.id)).length).toBe(trail.length);
    // Back to a person: the company out and the person in, one line, still shared at the same instant.
    ok(await edit(p.raiser, t.id, "assigneePersonId", p.assignee));
    const back = await itemRow(t.id);
    expect([back.assignedToContractor, back.assigneePersonId, back.sharedAt]).toEqual([false, p.assignee, row.sharedAt]);
    expect((await auditOf(t.id)).at(-1)!.changes).toEqual([{ field: "assigneePersonId", before: "contractor", after: p.assignee }]);
    // Contractor to nobody writes (unassigning a contractor-held item is not a no-change edit).
    ok(await edit(p.raiser, t.id, "assigneePersonId", "contractor"));
    ok(await edit(p.raiser, t.id, "assigneePersonId", ""));
    const none = await itemRow(t.id);
    expect([none.assignedToContractor, none.assigneePersonId, none.sharedAt]).toEqual([false, null, row.sharedAt]);
    expect((await auditOf(t.id)).at(-1)!.changes).toEqual([{ field: "assigneePersonId", before: "contractor", after: null }]);
  });

  it("Activity reads the company by the awardee's name in the one line, never the token or a column key", async () => {
    const t = await task(p.raiser, k.contractId, { assigneePersonId: p.assignee });
    ok(await edit(p.raiser, t.id, "assigneePersonId", "contractor"));
    const contract = await db.contract.findUniqueOrThrow({ where: { id: k.contractId }, include: { award: true } });
    const feed = await loadActivity({ organisationId: org.organisationId, contractId: k.contractId, contractNumber: contract.number, item: t, timeZone: "Asia/Kuala_Lumpur" });
    const line = feed.find((l) => l.kind === "CHANGE" && l.text.startsWith("Assignee:"))!;
    expect(line.kind === "CHANGE" && line.text).toBe(`Assignee: ${names.assignee} → ${contract.award.awardeeName}; Shared: none → ${(line.kind === "CHANGE" ? line.text : "").split("Shared: none → ")[1]}`);
    expect(line.kind === "CHANGE" && line.text).not.toMatch(/contractor →|sharedAt|assignedToContractor/);
    // The cards read the company, not a person, for the assignee.
    const list = await loadWorkList({ organisationId: org.organisationId, contractId: k.contractId, viewerId: p.raiser, view: "contractor", filters: {}, today: null, timeZone: null, page: 0, size: 100 });
    expect(list.rows.find((r) => r.id === t.id)?.assigneeName).toBe(contract.award.awardeeName);
  });

  it("the assignee picker lists the team first, then the contractor, then everyone else", async () => {
    const tk = await activeContract(org);
    ok(await as(org.so, () => addTeamMemberAction(form({ contractId: tk.contractId, role: "SITE_ENGINEER", personId: p.bystander }))));
    const options = await assigneeOptions({ organisationId: org.organisationId, contractId: tk.contractId });
    expect([...new Set(options.map((o) => o.group))]).toEqual(["TEAM", "CONTRACTOR", "EVERYONE"]);
    expect(options[0]).toMatchObject({ value: p.bystander, group: "TEAM" });
    expect(options[1]).toMatchObject({ value: "contractor", group: "CONTRACTOR" });
  });
});

describe("3b step 3: a comment's audience", () => {
  it("on an unshared item every comment is internal and a Reply is refused, never quietly kept internal; a tampered audience is refused whole", async () => {
    const t = await task(p.raiser, k.contractId);
    expect(refused(await say(p.raiser, t.id, "Hello", "REPLY"))).toBe("Share it first, or write an internal note.");
    expect(await db.workItemComment.count({ where: { workItemId: t.id } })).toBe(0);
    ok(await say(p.raiser, t.id, "Note", "INTERNAL"));
    ok(await say(p.raiser, t.id, "Plain"));
    expect(refused(await say(p.raiser, t.id, "Loud", "ANNOUNCE"))).toMatch(/didn't go through/);
    expect((await db.workItemComment.findMany({ where: { workItemId: t.id } })).map((c) => c.internal)).toEqual([true, true]);
  });

  it("on a shared item the choice is stored; a post with no choice is Internal on the server (WSEC-1: the composer presets Reply but always posts it); an earlier comment is never re-classified by the share", async () => {
    const t = await task(p.raiser, k.contractId);
    ok(await say(p.raiser, t.id, "Before the share"));
    ok(await shareAs(p.raiser, t.id));
    ok(await say(p.raiser, t.id, "Default"));
    ok(await say(p.raiser, t.id, "Chosen reply", "REPLY"));
    ok(await say(p.raiser, t.id, "Chosen note", "INTERNAL"));
    const rows = await db.workItemComment.findMany({ where: { workItemId: t.id }, orderBy: [{ recordedAt: "asc" }, { id: "asc" }] });
    expect(Object.fromEntries(rows.map((c) => [c.body, c.internal]))).toEqual({ "Before the share": true, Default: true, "Chosen reply": false, "Chosen note": true });
    // The audit row says which.
    const written = await db.auditEntry.findMany({ where: { entity: "WorkItemComment", entityId: { in: rows.map((c) => c.id) } } });
    expect(written.flatMap((e) => (e.changes as { field: string; after: string }[]).filter((c) => c.field === "audience").map((c) => c.after)).sort()).toEqual(["Internal note", "Internal note", "Internal note", "Reply"]);
  });

  it("WSEC-1: a comment or a file posted from a page that saw the item unshared is refused once it is shared (409 words), and a post that does not say what it saw is unreadable", async () => {
    const t = await task(p.raiser, k.contractId);
    ok(await shareAs(p.raiser, t.id));
    expect(refused(await say(p.raiser, t.id, "Written as an internal note", "INTERNAL", "no"))).toBe("This item was shared a moment ago. Check before sending.");
    expect(refused(await say(p.raiser, t.id, "No audience either", undefined, "no"))).toBe("This item was shared a moment ago. Check before sending.");
    expect(await db.workItemComment.count({ where: { workItemId: t.id } })).toBe(0);
    ok(await say(p.raiser, t.id, "Seen as shared", "REPLY", "yes"));
    expect(refused(await as(p.raiser, () => commentOnWorkItem(form({ contractId: k.contractId, itemId: t.id, body: "Nothing said of what the page saw" }))))).toMatch(/didn't go through/);
    expect(refused(await as(p.raiser, () => commentOnWorkItem(form({ contractId: k.contractId, itemId: t.id, body: "x", expectedShared: "maybe" }))))).toMatch(/didn't go through/);
    expect(refused(await as(p.raiser, () => attachWorkFiles(form({ contractId: k.contractId, itemId: t.id, stagedVersionId: ["x"] }))))).toMatch(/didn't go through/);
    expect(await db.workItemComment.count({ where: { workItemId: t.id } })).toBe(1);
  });

  it("WSEC-1: a share and a comment racing: whichever commits first, an internal note written from a stale page is never a Reply", async () => {
    for (let n = 0; n < 4; n++) {
      const t = await task(p.raiser, k.contractId);
      const [shared, written] = await Promise.all([shareAs(p.raiser, t.id), say(p.assignee, t.id, `Race ${n}`, "INTERNAL", "no")]);
      ok(shared);
      const rows = await db.workItemComment.findMany({ where: { workItemId: t.id } });
      // Either the comment came first (kept, internal) or the share did (refused, nothing written): never a comment on the portal.
      expect(rows.every((c) => c.internal)).toBe(true);
      expect(rows.length).toBe(written.refused ? 0 : 1);
      if (written.refused) expect(written.refused).toBe("This item was shared a moment ago. Check before sending.");
    }
  });

  it("WSEC-9: an RFI the contractor holds cannot be closed by the shortcut; taking it back and closing accepts the answer as it stands, and the trail records the text", async () => {
    const made = ok(await raise(p.raiser, k.contractId, { type: "RFI", title: "Rebar spacing", dueOn: "2026-12-31", assigneePersonId: "contractor" }));
    const rfi = await db.workItem.findFirstOrThrow({ where: { contractId: k.contractId, type: "RFI", number: Number(made.ref!.split("-")[1]) } });
    // The contractor's draft, as the portal's answer act leaves it (one field, one row: WB-6).
    await db.workItem.update({ where: { id: rfi.id }, data: { answer: "Use 20 mm bars." } });
    expect(refused(await move(p.raiser, k.contractId, rfi.id, "TO_DO", "DONE"))).toBe("This can't go from To do to Done.");
    expect((await itemRow(rfi.id)).status).toBe("TO_DO");
    // Taking it back is an assignment; the raiser then holds it and may close it, accepting the answer as it stands.
    ok(await edit(p.raiser, rfi.id, "assigneePersonId", p.raiser));
    ok(await move(p.raiser, k.contractId, rfi.id, "TO_DO", "DONE"));
    const closing = (await auditOf(rfi.id)).find((e) => (e.changes as { field: string; after: string | null }[]).some((c) => c.field === "status" && c.after === "DONE"))!;
    expect(closing.changes).toEqual(expect.arrayContaining([{ field: "answerAccepted", before: null, after: "Use 20 mm bars." }]));
    const contract = await db.contract.findUniqueOrThrow({ where: { id: k.contractId } });
    const feed = await loadActivity({ organisationId: org.organisationId, contractId: k.contractId, contractNumber: contract.number, item: rfi, timeZone: null });
    expect(feed.some((l) => l.kind === "CHANGE" && l.text.includes("Answer accepted"))).toBe(true);
    // A task, which has no answer, records none.
    const plain = await task(p.raiser, k.contractId);
    ok(await move(p.raiser, k.contractId, plain.id, "TO_DO", "DONE"));
    expect(JSON.stringify(await auditOf(plain.id))).not.toContain("answerAccepted");
  });

  it("Send back to a contractor assignee writes a Reply; on any other item it stays internal, shared or not", async () => {
    const held = await task(p.raiser, k.contractId, { assigneePersonId: "contractor" });
    const mine = await task(p.raiser, k.contractId, { assigneePersonId: p.assignee, share: "on" });
    const plain = await task(p.raiser, k.contractId, { assigneePersonId: p.assignee });
    // No staff path puts a contractor-held item In review (the contractor sends it for checking, step 4): seeded here.
    for (const t of [held, mine, plain]) await db.workItem.update({ where: { id: t.id }, data: { status: "IN_REVIEW" } });
    for (const t of [held, mine, plain]) ok(await move(p.raiser, k.contractId, t.id, "IN_REVIEW", "IN_PROGRESS", { comment: "Photograph the joint" }));
    const internalOf = async (id: string) => (await db.workItemComment.findMany({ where: { workItemId: id } })).map((c) => c.internal);
    expect([await internalOf(held.id), await internalOf(mine.id), await internalOf(plain.id)]).toEqual([[false], [true], [true]]);
    // The contractor is not told (PW-13): no person to tell on the held item.
    expect((await noticesOf(held.id)).filter((n) => n.kind === "WORK_ITEM_RETURNED")).toEqual([]);
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
    const attach = (who: string, ...ids: string[]) => as(who, async () => attachWorkFiles(form({ contractId: k.contractId, itemId: t.id, expectedShared: await seen(t.id), stagedVersionId: ids })));
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

describe("3b security: files and the share (WSEC-1)", () => {
  const prepare = async () => {
    const klass = await db.documentClass.create({ data: { organisationId: org.organisationId, code: `wsf_${randomId()}`, nameEn: "Project files", classification: "INTERNAL" } });
    await db.documentStorePolicy.upsert({ where: { organisationId: org.organisationId }, update: { projectDocumentClassId: klass.id }, create: { organisationId: org.organisationId, allowedMediaTypes: ["application/pdf"], maxBytes: BigInt(10_000_000), projectDocumentClassId: klass.id } });
    return klass.id;
  };
  const stageFile = async (classId: string, by: string) => {
    const bytes = new TextEncoder().encode(`%PDF-1.4 share ${randomId()} ${++counter}`);
    const sha = createHash("sha256").update(bytes).digest("hex");
    await db.blobContent.createMany({ data: [{ organisationId: org.organisationId, sha256: sha, byteSize: BigInt(bytes.length), bytes, storedAt: new Date() }], skipDuplicates: true });
    const name = `share-${counter}.pdf`;
    const doc = await db.document.create({ data: { organisationId: org.organisationId, title: name, documentClassId: classId, classificationSnapshot: "INTERNAL", retentionSnapshot: {}, stagedFor: "work-item" } });
    return (await db.documentVersion.create({ data: { organisationId: org.organisationId, documentId: doc.id, versionNo: 1, sha256: sha, byteSize: BigInt(bytes.length), mediaType: "application/pdf", originalFilename: name, recordedByPersonId: by, storedAt: new Date() } })).id;
  };
  const attachSeen = (who: string, itemId: string, versionId: string, expectedShared: string) => as(who, () => attachWorkFiles(form({ contractId: k.contractId, itemId, expectedShared, stagedVersionId: [versionId] })));

  it("a file attached from a page that saw the item unshared is refused once it is shared, and nothing is pinned or filed", async () => {
    const classId = await prepare();
    const t = await task(p.raiser, k.contractId);
    ok(await shareAs(p.raiser, t.id));
    const versionId = await stageFile(classId, p.raiser);
    expect(refused(await attachSeen(p.raiser, t.id, versionId, "no"))).toBe("This item was shared a moment ago. Check before sending.");
    expect(await db.documentAttachment.count({ where: { workItemId: t.id } })).toBe(0);
    expect((await db.document.findFirstOrThrow({ where: { versions: { some: { id: versionId } } } })).status).toBe("STAGED");
    ok(await attachSeen(p.raiser, t.id, versionId, "yes"));
  });

  it("a share and an attach racing: whichever commits first, a file meant for the staff is never one the portal lists", async () => {
    const classId = await prepare();
    for (let n = 0; n < 4; n++) {
      const t = await task(p.raiser, k.contractId);
      const versionId = await stageFile(classId, p.raiser);
      const [shared, attached] = await Promise.all([shareAs(p.raiser, t.id), attachSeen(p.raiser, t.id, versionId, "no")]);
      ok(shared);
      const pins = await db.documentAttachment.findMany({ where: { workItemId: t.id } });
      const sharedAt = (await itemRow(t.id)).sharedAt;
      expect(pins.length).toBe(attached.refused ? 0 : 1);
      for (const pin of pins) expect(portalSeesFile({ attachedAt: pin.attachedAt, byContractor: false }, sharedAt), `round ${n}`).toBe(false);
    }
  });
});

describe("3b step 3: removing a file", () => {
  const prepare = async () => {
    const klass = await db.documentClass.create({ data: { organisationId: org.organisationId, code: `wfr_${randomId()}`, nameEn: "Project files", classification: "INTERNAL" } });
    await db.documentStorePolicy.upsert({ where: { organisationId: org.organisationId }, update: { projectDocumentClassId: klass.id }, create: { organisationId: org.organisationId, allowedMediaTypes: ["application/pdf"], maxBytes: BigInt(10_000_000), projectDocumentClassId: klass.id } });
    return klass.id;
  };
  const stageFile = async (classId: string, by: string) => {
    const bytes = new TextEncoder().encode(`%PDF-1.4 remove ${randomId()} ${++counter}`);
    const sha = createHash("sha256").update(bytes).digest("hex");
    await db.blobContent.createMany({ data: [{ organisationId: org.organisationId, sha256: sha, byteSize: BigInt(bytes.length), bytes, storedAt: new Date() }], skipDuplicates: true });
    const name = `plan-${counter}.pdf`;
    const doc = await db.document.create({ data: { organisationId: org.organisationId, title: name, documentClassId: classId, classificationSnapshot: "INTERNAL", retentionSnapshot: {}, stagedFor: "work-item" } });
    return (await db.documentVersion.create({ data: { organisationId: org.organisationId, documentId: doc.id, versionNo: 1, sha256: sha, byteSize: BigInt(bytes.length), mediaType: "application/pdf", originalFilename: name, recordedByPersonId: by, storedAt: new Date() } })).id;
  };
  const attach = async (contractId: string, itemId: string, by: string, classId: string) => {
    ok(await as(by, async () => attachWorkFiles(form({ contractId, itemId, expectedShared: await seen(itemId), stagedVersionId: await stageFile(classId, by) }))));
    return db.documentAttachment.findFirstOrThrow({ where: { workItemId: itemId, detachedAt: null }, orderBy: { attachedAt: "desc" } });
  };
  const remove = (who: string, contractId: string, itemId: string, attachmentId: string, reason: string) => as(who, () => removeWorkFile(form({ contractId, itemId, attachmentId, reason })));

  it("the person who attached it removes it from an unshared item with a reason, audited; anyone else is told who can; a reason is needed", async () => {
    const classId = await prepare();
    const t = await task(p.raiser, k.contractId);
    const pin = await attach(k.contractId, t.id, p.assignee, classId);
    // The raiser did not attach it and is not the lead; a bystander neither.
    expect(refused(await remove(p.raiser, k.contractId, t.id, pin.id, "Wrong sheet"))).toBe(`Only ${names.assignee}, who attached it or the ${org.soLabel} (${(await db.person.findUniqueOrThrow({ where: { id: org.so } })).name}) can remove this file.`);
    expect(refused(await remove(p.bystander, k.contractId, t.id, pin.id, "Wrong sheet"))).toMatch(/can remove this file/);
    expect(refused(await remove(p.assignee, k.contractId, t.id, pin.id, "  "))).toBe("Give a reason.");
    expect((await db.documentAttachment.findUniqueOrThrow({ where: { id: pin.id } })).detachedAt).toBeNull();

    ok(await remove(p.assignee, k.contractId, t.id, pin.id, "Wrong sheet"));
    const gone = await db.documentAttachment.findUniqueOrThrow({ where: { id: pin.id } });
    expect([gone.detachedAt !== null, gone.detachReason]).toEqual([true, "Wrong sheet"]);
    const row = (await db.auditEntry.findMany({ where: { entity: "DocumentAttachment", entityId: pin.id, action: "UPDATE" } }))[0];
    expect(row.reason).toBe("Wrong sheet");
    expect(row.entityLabel.startsWith("Work item ")).toBe(true);
    expect(JSON.stringify(row.changes)).toContain("detachedBecause");
    // Gone from the item's files, and Activity says so; a second removal finds nothing.
    const detail = (await loadItem({ organisationId: org.organisationId, contractId: k.contractId, ref: itemRef("TASK", t.number), timeZone: null }))!;
    expect(detail.files).toEqual([]);
    const contract = await db.contract.findUniqueOrThrow({ where: { id: k.contractId } });
    expect((await loadActivity({ organisationId: org.organisationId, contractId: k.contractId, contractNumber: contract.number, item: t, timeZone: null })).some((l) => l.kind === "CHANGE" && l.text === "removed a file")).toBe(true);
    expect(refused(await remove(p.assignee, k.contractId, t.id, pin.id, "Again"))).toBe("That file no longer exists.");
  });

  it("on a shared item a file is never removed, not even by who attached it; the file's audience is read from when it was attached", async () => {
    const classId = await prepare();
    const t = await task(p.raiser, k.contractId);
    const before = await attach(k.contractId, t.id, p.raiser, classId);
    ok(await shareAs(p.raiser, t.id));
    // Acts are cut to the second, and a share is pushed past a file attached in its own second (the safe side): so a file meant to be seen is attached a second on.
    await new Promise((r) => setTimeout(r, 2100));
    const after = await attach(k.contractId, t.id, p.raiser, classId);
    expect(refused(await remove(p.raiser, k.contractId, t.id, before.id, "Wrong sheet"))).toBe("Shared files stay. Add a corrected file and reply.");
    expect(refused(await remove(p.raiser, k.contractId, t.id, after.id, "Wrong sheet"))).toBe("Shared files stay. Add a corrected file and reply.");
    expect(await db.documentAttachment.count({ where: { workItemId: t.id, detachedAt: null } })).toBe(2);
    // Seen by the contractor: only the one attached at or after the share.
    const detail = (await loadItem({ organisationId: org.organisationId, contractId: k.contractId, ref: itemRef("TASK", t.number), timeZone: null }))!;
    expect(detail.files.map((f) => [f.attachmentId, f.seenByContractor, f.attachedByPersonId])).toEqual([
      [before.id, false, p.raiser],
      [after.id, true, p.raiser],
    ]);
  });

  it("the lead removes a file someone else attached; an attachment of another item, contract or purpose reads as not found", async () => {
    const classId = await prepare();
    const tk = await activeContract(org);
    ok(await as(org.so, () => addTeamMemberAction(form({ contractId: tk.contractId, role: "PROJECT_MANAGER", personId: p.bystander }))));
    const t = await task(p.raiser, tk.contractId);
    const other = await task(p.raiser, tk.contractId);
    const pin = await attach(tk.contractId, t.id, p.assignee, classId);
    expect(refused(await remove(p.raiser, tk.contractId, t.id, pin.id, "x"))).toMatch(/Only .*who attached it or the Project manager/);
    expect(refused(await remove(p.bystander, tk.contractId, other.id, pin.id, "x"))).toBe("That file no longer exists.");
    expect(refused(await remove(p.bystander, k.contractId, t.id, pin.id, "x"))).toBe("That item no longer exists.");
    ok(await remove(p.bystander, tk.contractId, t.id, pin.id, "Superseded by the new drawing"));
    expect((await db.documentAttachment.findUniqueOrThrow({ where: { id: pin.id } })).detachReason).toBe("Superseded by the new drawing");
  });
});

describe("3b step 3: the Project team and the lead", () => {
  const team = (tk: TestContract) => db.projectTeamMember.findMany({ where: { contractId: tk.contractId }, orderBy: [{ role: "asc" }, { recordedAt: "asc" }] });
  const add = (who: string, tk: TestContract, role: string, personId: string) => as(who, () => addTeamMemberAction(form({ contractId: tk.contractId, role, personId })));
  const drop = (who: string, tk: TestContract, role: string, personId: string, reason: string) => as(who, () => removeTeamMemberAction(form({ contractId: tk.contractId, role, personId, reason })));
  const change = (who: string, tk: TestContract, personId: string) => as(who, () => changeProjectManagerAction(form({ contractId: tk.contractId, personId })));
  const said = (r: TeamResult): string => {
    expect(r.refused, "expected a refusal").toBeTruthy();
    return r.refused!;
  };
  const lead = async (tk: TestContract) => (await loadWorkContext({ organisationId: org.organisationId, contractId: tk.contractId, now: new Date() }))!.context.lead;

  /// A contract with no S.O. in force and no manager has no lead (WB-7): the S.O. assignment is taken off the fixture's contract.
  const leaderless = async () => {
    const tk = await activeContract(org);
    await db.contractSoAssignment.deleteMany({ where: { contractId: tk.contractId } });
    return tk;
  };

  it("until a manager is named the S.O. is the lead and changes the team; naming the manager hands the lead to the manager, and the S.O. keeps the right to change the team (WSEC-2); a second manager is refused", async () => {
    const tk = await activeContract(org);
    expect(await lead(tk)).toMatchObject({ ids: [org.so], roleLabel: org.soLabel });
    const soName = (await db.person.findUniqueOrThrow({ where: { id: org.so } })).name;
    expect(said(await add(p.raiser, tk, "PROJECT_MANAGER", p.assignee))).toBe(`Only the ${org.soLabel} (${soName}) can change the team.`);
    ok(await add(org.so, tk, "PROJECT_MANAGER", p.assignee));
    expect(await lead(tk)).toEqual({ ids: [p.assignee], roleLabel: "Project manager" });
    // The lead is the manager now, but the S.O. still changes the team; anyone else is told who may.
    expect(said(await add(p.bystander, tk, "SITE_ENGINEER", p.raiser))).toBe(`Only the Project manager (${names.assignee}) or the ${org.soLabel} (${soName}) can change the team.`);
    ok(await add(org.so, tk, "CONSULTANT", p.bystander));
    expect(said(await add(p.assignee, tk, "PROJECT_MANAGER", p.bystander))).toBe("There is a Project manager already. Change the manager instead.");
    ok(await add(p.assignee, tk, "SITE_ENGINEER", p.raiser));
    expect(said(await add(p.assignee, tk, "SITE_ENGINEER", p.raiser))).toBe("They already hold that role.");
    // The same person in two roles is allowed.
    ok(await add(p.assignee, tk, "CONTRACT_ADMINISTRATOR", p.assignee));
    // Rows come back in the roles' declared order.
    expect((await team(tk)).map((m) => [m.role, m.personId, m.addedByPersonId])).toEqual([
      ["PROJECT_MANAGER", p.assignee, org.so],
      ["SITE_ENGINEER", p.raiser, p.assignee],
      ["CONTRACT_ADMINISTRATOR", p.assignee, p.assignee],
      ["CONSULTANT", p.bystander, org.so],
    ]);
    // The slot is written for every added row.
    expect(h.written.filter((w) => w.entity === "ProjectTeamMember" && w.slot === "addedBy").length).toBeGreaterThanOrEqual(4);
  });

  it("WSEC-2: with no S.O. and no manager there is no lead, and nobody changes the team (was: anyone who could read the case named the first manager); an S.O. in force names the first one", async () => {
    const tk = await leaderless();
    expect(await lead(tk)).toEqual({ ids: [], roleLabel: null });
    const nobody = "Nobody can change the team yet. Set the S.O. for this contract, or the organisation's time zone.";
    for (const who of [p.raiser, p.assignee, p.bystander, org.so]) expect(said(await add(who, tk, "PROJECT_MANAGER", p.assignee))).toBe(nobody);
    expect(said(await change(p.raiser, tk, p.assignee))).toBe(nobody);
    expect(await team(tk)).toEqual([]);
    expect(await db.auditEntry.count({ where: { entity: "ProjectTeamMember", organisationId: org.organisationId, entityLabel: { startsWith: `Contract ${(await db.contract.findUniqueOrThrow({ where: { id: tk.contractId } })).number} ` } } })).toBe(0);
    // With the S.O. back in force, the S.O. names the first manager and nobody else may.
    const withSo = await activeContract(org);
    expect(said(await add(p.raiser, withSo, "PROJECT_MANAGER", p.assignee))).toMatch(/^Only the .* can change the team\.$/);
    ok(await add(org.so, withSo, "PROJECT_MANAGER", p.assignee));
  });

  it("WSEC-2: an inactive Project manager does not count as a changer, and the S.O. still does; the contractor's side has no part", async () => {
    const tk = await activeContract(org);
    const manager = (await makePerson(org.organisationId, `Inactive manager ${randomId()}`)).id;
    ok(await add(org.so, tk, "PROJECT_MANAGER", manager));
    await db.person.update({ where: { id: manager }, data: { isActive: false } });
    expect(said(await add(manager, tk, "CONSULTANT", p.bystander))).toMatch(/can change the team\.$/);
    ok(await add(org.so, tk, "CONSULTANT", p.bystander));
    const soName = (await db.person.findUniqueOrThrow({ where: { id: org.so } })).name;
    expect(said(await add(p.raiser, tk, "SITE_ENGINEER", p.raiser))).toBe(`Only the ${org.soLabel} (${soName}) can change the team.`);
  });

  it("an inactive person, or one of another organisation, cannot be named", async () => {
    const tk = await activeContract(org);
    const gone = (await makePerson(org.organisationId, `Gone ${randomId()}`)).id;
    await db.person.update({ where: { id: gone }, data: { isActive: false } });
    const stranger = (await makePerson((await db.organisation.create({ data: { code: `WFT_${randomId()}`, name: "Another" } })).id)).id;
    for (const id of [gone, stranger]) expect(said(await add(org.so, tk, "CONSULTANT", id))).toBe("Pick someone active who can see this contract.");
    expect(await team(tk)).toEqual([]);
  });

  it("two people naming a manager at once: one is named, the other is refused (the contract's lock); nothing half-done", async () => {
    const tk = await activeContract(org);
    // Only the S.O. may name the first manager (WSEC-2), so the two are the S.O. on two screens.
    const [a, b] = await Promise.all([add(org.so, tk, "PROJECT_MANAGER", p.raiser), add(org.so, tk, "PROJECT_MANAGER", p.bystander)]);
    expect([a.refused, b.refused].filter(Boolean)).toHaveLength(1);
    expect((await team(tk)).filter((m) => m.role === "PROJECT_MANAGER")).toHaveLength(1);
    expect((await db.auditEntry.findMany({ where: { entity: "ProjectTeamMember", entityId: { in: (await team(tk)).map((m) => m.id) } } })).length).toBe(1);
  });

  it("changing the manager is a remove and an add in one act, audited both ways, with names and no ids; removal asks a reason and audits it", async () => {
    const tk = await activeContract(org);
    ok(await add(org.so, tk, "PROJECT_MANAGER", p.assignee));
    ok(await add(p.assignee, tk, "SITE_ENGINEER", p.raiser));
    expect(said(await change(p.assignee, tk, p.assignee))).toBe("They already hold that role.");
    ok(await change(p.assignee, tk, p.bystander));
    expect((await team(tk)).filter((m) => m.role === "PROJECT_MANAGER").map((m) => m.personId)).toEqual([p.bystander]);
    const trail = await db.auditEntry.findMany({ where: { entity: "ProjectTeamMember", organisationId: org.organisationId, entityLabel: { startsWith: "Contract " } }, orderBy: { at: "asc" } });
    const mine = trail.filter((e) => JSON.stringify(e.changes).includes(names.bystander) || JSON.stringify(e.changes).includes(names.assignee));
    expect(mine.map((e) => e.action)).toEqual(expect.arrayContaining(["CREATE", "DELETE"]));
    const replaced = trail.find((e) => e.action === "DELETE" && e.reason === "Replaced by another Project manager.")!;
    expect(replaced.changes).toEqual([{ field: "role", before: "Project manager", after: null }, { field: "person", before: names.assignee, after: null }]);
    for (const e of trail) expect(JSON.stringify(e.changes)).not.toMatch(new RegExp(`${p.assignee}|${p.bystander}|${p.raiser}`));

    // The lead is now the new manager: the old one no longer changes the team (the manager and the S.O. do).
    const soName = (await db.person.findUniqueOrThrow({ where: { id: org.so } })).name;
    expect(said(await drop(p.assignee, tk, "SITE_ENGINEER", p.raiser, "Moved off site"))).toBe(`Only the Project manager (${names.bystander}) or the ${org.soLabel} (${soName}) can change the team.`);
    expect(said(await drop(p.bystander, tk, "SITE_ENGINEER", p.raiser, " "))).toBe("Give a reason.");
    expect(said(await drop(p.bystander, tk, "CONSULTANT", p.raiser, "Not there"))).toBe("They are not on the team any more.");
    ok(await drop(p.bystander, tk, "SITE_ENGINEER", p.raiser, "Moved off site"));
    const del = (await db.auditEntry.findMany({ where: { entity: "ProjectTeamMember", action: "DELETE", reason: "Moved off site" } }))[0];
    expect(del.changes).toEqual([{ field: "role", before: "Site engineer", after: null }, { field: "person", before: names.raiser, after: null }]);
  });

  it("the lead is the Project manager: she edits an item she did not raise; a manager who is no longer active is not the lead, so the card can never be locked shut", async () => {
    const tk = await activeContract(org);
    const manager = (await makePerson(org.organisationId, `Manager ${randomId()}`)).id;
    ok(await add(org.so, tk, "PROJECT_MANAGER", manager));
    const t = await task(p.raiser, tk.contractId);
    ok(await as(manager, () => editWorkField(form({ contractId: tk.contractId, itemId: t.id, field: "priority", value: "HIGH" }))));
    expect(refused(await as(p.bystander, () => editWorkField(form({ contractId: tk.contractId, itemId: t.id, field: "priority", value: "LOW" })))).length).toBeGreaterThan(0);
    await db.person.update({ where: { id: manager }, data: { isActive: false } });
    expect((await lead(tk)).ids).toEqual([org.so]);
    expect(said(await add(p.bystander, tk, "SITE_ENGINEER", p.bystander))).toMatch(/can change the team\.$/);
    ok(await add(org.so, tk, "SITE_ENGINEER", p.bystander));
  });

  it("a terminated contract refuses every team act and changes nothing", async () => {
    const tk = await activeContract(org);
    ok(await add(org.so, tk, "PROJECT_MANAGER", p.assignee));
    await db.contract.update({ where: { id: tk.contractId }, data: { status: "TERMINATED" } });
    for (const r of [await add(p.assignee, tk, "SITE_ENGINEER", p.raiser), await drop(p.assignee, tk, "PROJECT_MANAGER", p.assignee, "x"), await change(p.assignee, tk, p.raiser)]) expect(r.refused).toBeTruthy();
    expect((await team(tk)).map((m) => m.personId)).toEqual([p.assignee]);
  });

  it("a form that names a role nobody offers, or no person, is refused whole", async () => {
    const tk = await activeContract(org);
    expect(said(await add(p.raiser, tk, "OWNER", p.assignee))).toMatch(/didn't go through/);
    expect(said(await add(p.raiser, tk, "CONSULTANT", ""))).toMatch(/didn't go through/);
    expect(await team(tk)).toEqual([]);
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

  // 3b step 3 (the step 2 handoff): the contractor rows, on a contract of their own so 3a's counts stand. The view "Waiting on {contractor}", the Shared filter and the
  // contractor-assignee filter are judged by `inView` and by the database over the same rows, each of which keeps the 3b CHECKs.
  it("the contractor view and the shared and contractor-assignee filters agree between inView and the database on the contractor rows", async () => {
    const own = await activeContract(org);
    const account = (await makeSupplierAccount(org.organisationId)).account!;
    const byId = new Map<string, string>();
    for (const i of FIXTURE_CONTRACTOR_ITEMS) {
      const closed = i.status === "DONE" || i.status === "CANCELLED";
      const row = await db.workItem.create({
        data: {
          organisationId: org.organisationId,
          contractId: own.contractId,
          type: i.type,
          number: i.number,
          title: i.title,
          status: i.status,
          priority: i.priority,
          dueOn: i.dueOn ? dayToDate(i.dueOn) : null,
          raisedByPersonId: i.raisedBy.kind === "PERSON" ? person[i.raisedBy.id] : null,
          raisedBySupplierAccountId: i.raisedBy.kind === "CONTRACTOR" ? account.id : null,
          assigneePersonId: i.assignee?.kind === "PERSON" ? person[i.assignee.id] : null,
          assignedToContractor: i.assignee?.kind === "CONTRACTOR",
          sharedAt: i.sharedAt ? new Date(i.sharedAt) : null,
          answer: i.answer,
          inspectionResult: i.inspectionResult,
          severity: i.type === "SAFETY_INCIDENT" ? "NEAR_MISS" : null,
          happenedAt: i.type === "SAFETY_INCIDENT" ? new Date() : null,
          cancelReason: i.status === "CANCELLED" ? "Withdrawn" : "",
          closedAt: closed ? new Date() : null,
          recordedAt: new Date(),
        },
      });
      byId.set(row.id, i.id);
    }
    const reader = { personId: person[FIXTURE_READER] };
    const rowOf = (i: (typeof FIXTURE_CONTRACTOR_ITEMS)[number]): WorkRow => ({
      ...i,
      raisedBy: i.raisedBy.kind === "PERSON" ? { kind: "PERSON", id: person[i.raisedBy.id] } : i.raisedBy,
      assignee: i.assignee?.kind === "PERSON" ? { kind: "PERSON", id: person[i.assignee.id] } : i.assignee,
    });
    let compared = 0;
    for (const view of [...VIEWS, "contractor" as WorkView]) {
      for (const f of [{}, { shared: true }, { shared: false }, { assignee: "contractor" }, { assignee: person.aisyah }, { type: "RFI" as const }] as WorkFilters[]) {
        const where = { organisationId: org.organisationId, contractId: own.contractId, ...workWhere(view, f, reader, FIXTURE_TODAY) } as Prisma.WorkItemWhereInput;
        const inDb = (await db.workItem.findMany({ where, select: { id: true } })).map((r) => byId.get(r.id)!).sort();
        const inMemory = FIXTURE_CONTRACTOR_ITEMS.filter((i) => inView(rowOf(i), view, reader, FIXTURE_TODAY, f)).map((i) => i.id).sort();
        expect(inDb, `${view} ${JSON.stringify(f)}`).toEqual(inMemory);
        compared += inMemory.length;
      }
    }
    expect(compared).toBeGreaterThan(30);
    // "Waiting on {contractor}": the four rows the rule names, and the loaders read the company, never the account's contact, for the contractor-raised rows.
    const waiting = await loadWorkList({ organisationId: org.organisationId, contractId: own.contractId, viewerId: person.aisyah, view: "contractor", filters: {}, today: FIXTURE_TODAY, timeZone: "Asia/Kuala_Lumpur", page: 0, size: 100 });
    expect(waiting.total).toBe(FIXTURE_CONTRACTOR_ITEMS.filter((i) => inView(rowOf(i), "contractor", reader, FIXTURE_TODAY)).length);
    const contract = await db.contract.findUniqueOrThrow({ where: { id: own.contractId }, include: { award: true } });
    for (const r of waiting.rows.filter((x) => x.raisedBy.kind === "CONTRACTOR")) expect(r.raisedByName).toBe(contract.award.awardeeName);
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
