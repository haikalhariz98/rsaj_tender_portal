import { beforeAll, describe, expect, it, vi } from "vitest";

import type { StaffActor, SupplierActor } from "@/lib/auth/types";
import { dayPlus } from "@/lib/dates";
import { db } from "@/lib/db";
import { makeSupplierAccount, randomId } from "@/lib/test-db/auth-fixtures";
import { activeContract, contractOrg, D, form, today, type TestContract, type TestOrg } from "@/lib/test-db/contract.fixture";
import type { WrittenAttribution } from "@/lib/test-support/staff";

/**
 * The defect link through its acts against Postgres (workspace 3b-ii step 10; plan B-18; WB-12). A Defect item stands for a defect line: the CPC's list takes picked items (their
 * lines created and linked), removing a line leaves a snag, every defect act (the contractor's "Mark as fixed", the officer's accept, return, withdraw) writes the item's status
 * through, a move on a linked item is a defect act refused in its words, a Defect item raised during the defects liability period is created WITH its line in one act, and the
 * CPC's frozen lines are never touched. The sign-in and the attribution are faked as the other action tests fake them.
 */

const h = vi.hoisted(() => ({ who: null as StaffActor | null, written: [] as WrittenAttribution[] }));
vi.mock("@/app/_auth/actor", async () => {
  const { actorModule } = await import("@/lib/test-support/staff");
  return { ...actorModule(), staffForAct: async () => ({ ok: true as const, actor: h.who! }), requireStaff: async () => h.who! };
});
vi.mock("@/app/_auth/act", async () => {
  const { actModule } = await import("@/lib/test-support/staff");
  const act = actModule({ now: new Date() });
  h.written = act.written;
  return act.module;
});
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined, updateTag: () => undefined }));

import { recordCertificateSignature, sendCertificateToSigning, voidCertificateAct } from "@/app/projects/[id]/certificates/[certId]/actions";
import { acceptDefect, addCpcDefect, addCpcDefectsFromItems, raisePracticalCompletion, removeCpcDefect, reportDefect, reportDefectRectified, withdrawDefect } from "@/app/projects/[id]/closeout-actions";
import { createWorkItem, editWorkField, moveWorkItem, type WorkResult } from "@/app/projects/[id]/work-actions";

import { CONTRACTOR_ASSIGNEE } from "./fields";
import { itemRef } from "./number";
import { moveAsContractor } from "./portal-store";
import type { WorkItemType } from "./types";

let o: TestOrg;
let k: TestContract;
let supplier: SupplierActor;
const as = <T>(personId: string, fn: () => Promise<T>): Promise<T> => {
  h.who = o.staff(personId);
  return fn();
};

async function cpcForm() {
  const kind = "PRACTICAL_COMPLETION";
  const templateId = (await db.documentTemplate.create({ data: { organisationId: o.organisationId, code: `${kind.toLowerCase()}_${randomId()}`, nameEn: `${kind} (test)`, formCode: "PRACTI", bodyEn: "Certificate {{certificate.number}} for contract {{contract.number}}.", bodyVersion: 1 } })).id;
  await db.formSignatureBlock.createMany({
    data: [
      { organisationId: o.organisationId, templateId, blockOrder: 1, blockKind: "AUTHORISING", labelEn: "Superintending Officer", officeRule: "SO", delegable: false, datesCertificate: true },
      { organisationId: o.organisationId, templateId, blockOrder: 2, blockKind: "CONTRACTOR", labelEn: "Received by the contractor", officeRule: "CONTRACTOR", delegable: true, refusalAllowed: true },
    ],
  });
  await db.formDistribution.create({ data: { organisationId: o.organisationId, templateId, recipientCode: "contractor", labelEn: "The contractor (original)", mandatory: true, ackRequired: true, condition: "NONE", isOriginal: true, sortOrder: 1, provenance: "ASSUMED" } });
  await db.certificateKindSetting.create({ data: { organisationId: o.organisationId, kind, templateId, routingTypeId: null, provenance: "ASSUMED" } });
}

async function issue(certId: string) {
  await db.approvalInstance.create({ data: { organisationId: o.organisationId, matterKind: "CERTIFICATE", certificateId: certId, domain: "practical_completion", status: "APPROVED", openedAt: new Date() } });
  const sent = await as(o.so, () => sendCertificateToSigning({ ok: false }, form({ certId })));
  expect(sent.ok, sent.message).toBe(true);
  const so = await as(o.so, () => recordCertificateSignature({ ok: false }, form({ certId, blockOrder: "1", personBlock: "yes", personId: o.so, "personId:password": "any" })));
  expect(so.ok, so.message).toBe(true);
  return as(o.so, () => recordCertificateSignature({ ok: false }, form({ certId, blockOrder: "2", personBlock: "no", name: "Tan Mei Hua", icNumber: "000000-00-0013", signedOn: today() })));
}

const ok = (r: WorkResult): WorkResult => {
  expect(r.refused, "expected the act to go through").toBeUndefined();
  return r;
};
const refused = (r: WorkResult): string => {
  expect(r.refused, "expected a refusal").toBeTruthy();
  return r.refused!;
};
const dayOf = (n: number) => dayPlus(today(), n);

/// A Defect item raised on the contract, assigned to the contractor (so it is shared and the contractor can mark it fixed).
async function snag(title: string, fields: Record<string, string> = {}) {
  const r = ok(await as(o.so, () => createWorkItem(form({ contractId: k.contractId, type: "DEFECT", title, dueOn: dayOf(20), assigneePersonId: CONTRACTOR_ASSIGNEE, ...fields }))));
  return db.workItem.findFirstOrThrow({ where: { contractId: k.contractId, type: "DEFECT", number: Number(r.ref!.split("-")[1]) } });
}
const item = (id: string) => db.workItem.findUniqueOrThrow({ where: { id } });
const lineOf = async (itemId: string) => db.defectItem.findUniqueOrThrow({ where: { id: (await item(itemId)).defectItemId! }, include: { events: { orderBy: [{ recordedAt: "asc" }, { id: "asc" }] } } });
const move = (who: string, itemId: string, from: string, to: string, extra: Record<string, string> = {}) => as(who, () => moveWorkItem(form({ contractId: k.contractId, itemId, from, to, ...extra })));
const fixed = (itemRow: { type: WorkItemType; number: number }, expectedFrom: string) => moveAsContractor(supplier, { contractId: k.contractId, item: itemRef(itemRow.type, itemRow.number), action: "SEND_FOR_REVIEW", expectedFrom: expectedFrom as "IN_PROGRESS", comment: "" });

let a: Awaited<ReturnType<typeof snag>>;
let b: Awaited<ReturnType<typeof snag>>;
let c: Awaited<ReturnType<typeof snag>>;
let d: Awaited<ReturnType<typeof snag>>;
let task: { id: string };
let cpcId = "";
let frozenBefore: unknown;

beforeAll(async () => {
  o = await contractOrg("DLK");
  await cpcForm();
  // Completed 60 days ago, with a three-month defects liability period still running.
  k = await activeContract(o, { dueIn: -60, dlpMonths: 3 });
  const s = await makeSupplierAccount(o.organisationId);
  await db.supplier.update({ where: { id: s.supplier.id }, data: { status: "REGISTERED", registeredOn: D(dayPlus(today(), -500)) } });
  supplier = { kind: "SUPPLIER", accountId: s.account!.id, sessionId: `ses_${randomId()}`, contactId: s.contact.id, displayName: s.contact.name, supplierId: s.supplier.id, supplierName: s.supplier.registeredName, loginName: s.loginName, organisationId: o.organisationId, organisationTimeZone: "Asia/Kuala_Lumpur", stepUpAt: null, sessionCreatedAt: new Date(), sourceAddress: "203.0.113.9", mustChangePassword: false, resetNoticePending: false };
  const award = await db.contract.findUniqueOrThrow({ where: { id: k.contractId }, select: { awardId: true } });
  await db.award.update({ where: { id: award.awardId }, data: { vendorId: supplier.supplierId } });
});

describe("before the CPC: a Defect item is a snag, and the CPC's list takes picked items", () => {
  it("raises snags with no line; picks them on the draft CPC; removing a line leaves a snag", async () => {
    [a, b, c, d] = [await snag("Leaking roof, block A"), await snag("Cracked tiles"), await snag("Loose handrail"), await snag("Stained ceiling")];
    for (const x of [a, b, c, d]) expect(x.defectItemId).toBeNull();
    task = ok(await as(o.so, () => createWorkItem(form({ contractId: k.contractId, type: "TASK", title: "Not a defect" })))) && (await db.workItem.findFirstOrThrow({ where: { contractId: k.contractId, type: "TASK" } }));

    const r = await as(o.so, () => raisePracticalCompletion({ ok: false }, form({ id: k.contractId, completionDate: k.due, possessionTakenOn: k.due, inspectedOn: dayPlus(k.due, 1), testReasons: "The works are complete save the defects listed.", attendeeIds: o.so })));
    expect(r.ok, r.message).toBe(true);
    cpcId = (await db.practicalCompletion.findFirstOrThrow({ where: { contractId: k.contractId } })).certificateId;

    // Only Defect items, open, not yet on a list, are taken; a refusal leaves nothing.
    const wrong = await as(o.so, () => addCpcDefectsFromItems({ ok: false }, form({ id: k.contractId, itemIds: [a.id, task.id] })));
    expect(wrong.ok).toBe(false);
    expect(wrong.message).toMatch(/is not a Defect item/);
    expect(await db.defectItem.count({ where: { contractId: k.contractId } })).toBe(0);
    expect((await item(a.id)).defectItemId).toBeNull();

    const picked = await as(o.so, () => addCpcDefectsFromItems({ ok: false }, form({ id: k.contractId, itemIds: [a.id, b.id, c.id, d.id] })));
    expect(picked.ok, picked.message).toBe(true);
    for (const x of [a, b, c, d]) {
      const row = await item(x.id);
      expect(row.defectItemId).not.toBeNull();
      expect(row.status).toBe("IN_PROGRESS");
      const line = await lineOf(x.id);
      expect(line.description).toMatch(new RegExp(x.title));
      expect(line.source).toBe("PRACTICAL_COMPLETION");
      expect(line.events).toEqual([]);
    }
    const again = await as(o.so, () => addCpcDefectsFromItems({ ok: false }, form({ id: k.contractId, itemIds: [a.id] })));
    expect(again.message).toMatch(/already on a defect list/);

    // A line keyed by the officer with no item stays in Close-out (the legal schedule).
    expect((await as(o.so, () => addCpcDefect({ ok: false }, form({ id: k.contractId, description: "Keyed at the inspection", dueOn: dayOf(20) })))).ok).toBe(true);

    // Removing d's line clears the link first (the key restricts); the item stays a snag.
    const lineD = (await item(d.id)).defectItemId!;
    const removed = await as(o.so, () => removeCpcDefect({ ok: false }, form({ id: k.contractId, defectId: lineD })));
    expect(removed.ok, removed.message).toBe(true);
    expect(await db.defectItem.count({ where: { id: lineD } })).toBe(0);
    const snagD = await item(d.id);
    expect(snagD.defectItemId).toBeNull();
    expect(snagD.status).toBe("IN_PROGRESS");
    const trail = await db.auditEntry.findMany({ where: { organisationId: o.organisationId, entity: "WorkItem", entityId: d.id }, orderBy: { at: "asc" } });
    expect(JSON.stringify(trail.map((t) => t.changes))).toMatch(/defectItemId/);
  });

  it("issues the CPC; the list is frozen", async () => {
    const r = await issue(cpcId);
    expect(r.ok, r.message).toBe(true);
    const pc = await db.practicalCompletion.findFirstOrThrow({ where: { contractId: k.contractId } });
    expect((pc.frozenLines as unknown[]).length).toBe(4);
    frozenBefore = JSON.parse(JSON.stringify(pc.frozenLines));
    // A line's removal after issue is refused, and so is a pick.
    const lineA = (await item(a.id)).defectItemId!;
    expect((await as(o.so, () => removeCpcDefect({ ok: false }, form({ id: k.contractId, defectId: lineA })))).ok).toBe(false);
    expect((await item(a.id)).defectItemId).toBe(lineA);
    expect((await as(o.so, () => addCpcDefectsFromItems({ ok: false }, form({ id: k.contractId, itemIds: [d.id] })))).ok).toBe(false);
  });
});

describe("every defect act moves its linked item, and only it", () => {
  it("the contractor's Mark as fixed reports the line rectified and moves the item to In review", async () => {
    const before = await item(c.id);
    await fixed(a, "IN_PROGRESS");
    const line = await lineOf(a.id);
    expect(line.events.map((e) => e.kind)).toEqual(["REPORTED_RECTIFIED"]);
    expect(line.events[0].supplierAccountId).toBe(supplier.accountId);
    expect((await item(a.id)).status).toBe("IN_REVIEW");
    expect((await item(c.id)).status).toBe(before.status); // only the linked item moved
    expect((await lineOf(c.id)).events).toEqual([]);
    const audit = await db.auditEntry.findFirstOrThrow({ where: { organisationId: o.organisationId, entity: "WorkItem", entityId: a.id, actorKind: "SUPPLIER" } });
    expect(JSON.stringify(audit.changes)).toMatch(/IN_REVIEW/);
    // The contractor is refused in the defect core's words when it reports twice.
    await expect(fixed(a, "IN_REVIEW")).rejects.toMatchObject({ words: expect.any(String) });
  });

  it("Send back is returnDefect (the comment is its note) and the item reads In progress again", async () => {
    expect(refused(await move(o.so, a.id, "IN_REVIEW", "IN_PROGRESS", { comment: "" }))).toMatch(/why it is not made good|Say why/i);
    ok(await move(o.so, a.id, "IN_REVIEW", "IN_PROGRESS", { comment: "Still leaks at the parapet." }));
    const line = await lineOf(a.id);
    expect(line.events.map((e) => [e.kind, e.note])).toEqual([["REPORTED_RECTIFIED", ""], ["RETURNED", "Still leaks at the parapet."]]);
    expect(line.events[1].personId).toBe(o.so);
    expect((await item(a.id)).status).toBe("IN_PROGRESS");
  });

  it("Mark done is acceptDefect: the line is made good, the item is Done and closed; Reopen is refused", async () => {
    await fixed(a, "IN_PROGRESS");
    ok(await move(o.so, a.id, "IN_REVIEW", "DONE"));
    const line = await lineOf(a.id);
    expect(line.events.map((e) => e.kind)).toEqual(["REPORTED_RECTIFIED", "RETURNED", "REPORTED_RECTIFIED", "MADE_GOOD"]);
    const done = await item(a.id);
    expect(done.status).toBe("DONE");
    expect(done.closedAt).not.toBeNull();
    expect(refused(await move(o.so, a.id, "DONE", "TO_DO"))).toBe("This defect is closed in Close-out.");
    expect((await item(a.id)).status).toBe("DONE");
  });

  it("Cancel is withdrawDefect: the reason is the withdrawal's note and the item's cancel reason", async () => {
    expect(refused(await move(o.so, b.id, "IN_PROGRESS", "CANCELLED", { reason: "" }))).toMatch(/Why it is withdrawn|reason/i);
    ok(await move(o.so, b.id, "IN_PROGRESS", "CANCELLED", { reason: "Not the contractor's work." }));
    const line = await lineOf(b.id);
    expect(line.events.map((e) => [e.kind, e.note])).toEqual([["WITHDRAWN", "Not the contractor's work."]]);
    const row = await item(b.id);
    expect(row.status).toBe("CANCELLED");
    expect(row.cancelReason).toBe("Not the contractor's work.");
    expect(row.closedAt).not.toBeNull();
  });

  it("the Close-out screen's own acts write through too (report rectified, accept, withdraw on a line)", async () => {
    const line = (await item(c.id)).defectItemId!;
    expect((await as(o.so, () => reportDefectRectified({ ok: false }, form({ id: k.contractId, defectId: line, on: today() })))).ok).toBe(true);
    expect((await item(c.id)).status).toBe("IN_REVIEW");
    expect((await as(o.so, () => acceptDefect({ ok: false }, form({ id: k.contractId, defectId: line, on: today() })))).ok).toBe(true);
    expect((await item(c.id)).status).toBe("DONE");
    // A line keyed with no item changes nothing on any item.
    const bare = await db.defectItem.findFirstOrThrow({ where: { contractId: k.contractId, description: "Keyed at the inspection" } });
    expect((await as(o.so, () => withdrawDefect({ ok: false }, form({ id: k.contractId, defectId: bare.id, on: today(), note: "Duplicate." })))).ok).toBe(true);
  });

  it("a snag taken off the list is an ordinary item again: its own rules, no defect event", async () => {
    ok(await move(o.so, d.id, "IN_PROGRESS", "CANCELLED", { reason: "Withdrawn before the list was issued." }));
    expect((await item(d.id)).status).toBe("CANCELLED");
    expect(await db.defectEvent.count({ where: { organisationId: o.organisationId, note: "Withdrawn before the list was issued." } })).toBe(0);
  });

  it("the CPC's frozen lines are untouched by any of it", async () => {
    const pc = await db.practicalCompletion.findFirstOrThrow({ where: { contractId: k.contractId } });
    expect(JSON.parse(JSON.stringify(pc.frozenLines))).toEqual(frozenBefore);
  });
});

describe("WB-12: a Defect item raised during the defects liability period is created with its line, in one act", () => {
  const raise = (who: string, fields: Record<string, string>) => as(who, () => createWorkItem(form({ contractId: k.contractId, type: "DEFECT", title: "Spalling at the stairwell", dueOn: dayOf(14), ...fields })));
  const counts = async () => ({ items: await db.workItem.count({ where: { contractId: k.contractId } }), lines: await db.defectItem.count({ where: { contractId: k.contractId } }) });

  it("creates both, attributed in both slots, the item In progress and linked", async () => {
    const before = await counts();
    const r = ok(await raise(o.so, { observedOn: today(), location: "Block B" }));
    expect(await counts()).toEqual({ items: before.items + 1, lines: before.lines + 1 });
    const row = await db.workItem.findFirstOrThrow({ where: { contractId: k.contractId, type: "DEFECT", number: Number(r.ref!.split("-")[1]) } });
    expect(row.status).toBe("IN_PROGRESS");
    const line = await db.defectItem.findUniqueOrThrow({ where: { id: row.defectItemId! } });
    expect(line.source).toBe("LIABILITY_PERIOD");
    expect(line.observedOn?.toISOString().slice(0, 10)).toBe(today());
    expect(line.reportedByPersonId).toBe(o.so);
    expect(line.location).toBe("Block B");
    const slots = h.written.filter((w) => w.entityId === row.id || w.entityId === line.id).map((w) => `${w.entity}.${w.slot}`);
    expect(slots.length).toBe(2);
    expect(new Set(slots).size).toBe(2);
  });

  it("a move on it by an officer who may not record a defect is refused in the defect act's own words, from the item and from Close-out alike", async () => {
    const row = await db.workItem.findFirstOrThrow({ where: { contractId: k.contractId, title: "Spalling at the stairwell" } });
    const line = row.defectItemId!;
    const here = refused(await move(o.other, row.id, "IN_PROGRESS", "DONE"));
    const there = await as(o.other, () => acceptDefect({ ok: false }, form({ id: k.contractId, defectId: line, on: today() })));
    expect(there.ok).toBe(false);
    expect(here).toBe(there.message);
    expect(here).not.toMatch(/^Only /); // the item's who-may rule is not what spoke
    expect((await item(row.id)).status).toBe("IN_PROGRESS");
    expect((await lineOf(row.id)).events).toEqual([]);
  });

  it("is refused for an actor reportDefect refuses, in the same words, and writes neither", async () => {
    const before = await counts();
    const here = refused(await raise(o.other, { observedOn: today() }));
    expect(await counts()).toEqual(before);
    const there = await as(o.other, () => reportDefect({ ok: false }, form({ id: k.contractId, description: "Spalling", dueOn: dayOf(14), observedOn: today() })));
    expect(there.ok).toBe(false);
    expect(here).toBe(there.message);
  });

  it("is refused without the day it was observed, or outside the period, in reportDefect's words, and writes neither", async () => {
    const before = await counts();
    expect(refused(await raise(o.so, {}))).toMatch(/^Not recorded:.*observed/i);
    expect(refused(await raise(o.so, { observedOn: dayPlus(k.due, -5) }))).toMatch(/^Not recorded:/);
    expect(refused(await raise(o.so, { observedOn: today(), dueOn: "" }))).toMatch(/^Not recorded:|Pick a due date/);
    expect(await counts()).toEqual(before);
  });
});

describe("two people act on one linked pair at once", () => {
  it("an accept from Close-out, a Mark done from the item and an edit of its title: one accept lands, the pair is in step", async () => {
    const made = ok(await as(o.so, () => createWorkItem(form({ contractId: k.contractId, type: "DEFECT", title: "Racing defect", dueOn: dayOf(14), observedOn: today(), assigneePersonId: CONTRACTOR_ASSIGNEE }))));
    const row = await db.workItem.findFirstOrThrow({ where: { contractId: k.contractId, title: "Racing defect" } });
    expect(made.ref).toBeTruthy();
    const lineId = row.defectItemId!;
    const [accept, edit, mark] = await Promise.all([
      as(o.so, () => acceptDefect({ ok: false }, form({ id: k.contractId, defectId: lineId, on: today() }))),
      as(o.so, () => editWorkField(form({ contractId: k.contractId, itemId: row.id, field: "title", value: "Racing defect (edited)" }))),
      as(o.so, () => moveWorkItem(form({ contractId: k.contractId, itemId: row.id, from: "IN_PROGRESS", to: "DONE" }))),
    ]);
    void edit;
    const events = await db.defectEvent.findMany({ where: { defectId: lineId } });
    // Exactly one accept lands, whichever door it came through; the other is refused, not doubled.
    expect(events.filter((x) => x.kind === "MADE_GOOD")).toHaveLength(1);
    expect([accept.ok, mark.refused === undefined].filter(Boolean)).toHaveLength(1);
    const final = await item(row.id);
    expect(final.status).toBe("DONE");
    expect(final.closedAt).not.toBeNull();
  });
});

describe("voiding the draft CPC", () => {
  it("unlinks the items its list picked: they stay snags, offered again, and the unlink is audited", async () => {
    const k2 = await activeContract(o, { dueIn: -60, dlpMonths: 3 });
    const made = ok(await as(o.so, () => createWorkItem(form({ contractId: k2.contractId, type: "DEFECT", title: "Picked then voided", dueOn: dayOf(20) }))));
    const row = await db.workItem.findFirstOrThrow({ where: { contractId: k2.contractId, type: "DEFECT", number: Number(made.ref!.split("-")[1]) } });
    const raised = await as(o.so, () => raisePracticalCompletion({ ok: false }, form({ id: k2.contractId, completionDate: k2.due, possessionTakenOn: k2.due, inspectedOn: dayPlus(k2.due, 1), testReasons: "Complete save the defects.", attendeeIds: o.so })));
    expect(raised.ok, raised.message).toBe(true);
    const picked = await as(o.so, () => addCpcDefectsFromItems({ ok: false }, form({ id: k2.contractId, itemIds: [row.id] })));
    expect(picked.ok, picked.message).toBe(true);
    const lineId = (await item(row.id)).defectItemId!;
    expect(lineId).not.toBeNull();

    const certId = (await db.practicalCompletion.findFirstOrThrow({ where: { contractId: k2.contractId } })).certificateId;
    const voided = await as(o.so, () => voidCertificateAct({ ok: false }, form({ certId, reason: "Raised on the wrong day (test)." })));
    expect(voided.ok, voided.message).toBe(true);

    const after = await item(row.id);
    expect(after.defectItemId).toBeNull();
    expect(after.status).toBe("IN_PROGRESS");
    expect(await db.defectItem.count({ where: { id: lineId } })).toBe(1); // the voided CPC keeps its lines; no register reads them
    const trail = await db.auditEntry.findMany({ where: { organisationId: o.organisationId, entity: "WorkItem", entityId: row.id }, orderBy: { at: "asc" } });
    expect(JSON.stringify(trail.at(-1)!.changes)).toMatch(/defectItemId/);
  });
});
