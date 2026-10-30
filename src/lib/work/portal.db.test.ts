import { createHash } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import { refusalReply } from "@/app/supplier/projects/reply";
import type { SupplierActor } from "@/lib/auth/types";
import { loadContract } from "@/lib/contract/repo";
import { db } from "@/lib/db";
import { documentOrg } from "@/lib/documents/service";
import { STAGED_FOR_WORK_ITEM } from "@/lib/documents/staged-for";
import { blobStore, sha256Hex } from "@/lib/documents/store";
import { preflightProjectUpload, storeProjectFile } from "@/lib/project-docs/portal-upload";
import { ProjectRefused } from "@/lib/portal/projects/types";
import { parseAnswerBody, parseAttachBody, parseMoveBody, parseRaiseBody, parseReplyBody } from "@/lib/portal/projects/work-api";
import { activeContract, contractOrg, D, today, type TestContract, type TestOrg } from "@/lib/test-db/contract.fixture";
import { makePerson, makeSupplierAccount, randomId } from "@/lib/test-db/auth-fixtures";

import { audienceFaults, portalSeesFile } from "./audience";
import { CONTRACTOR_RAISES_PER_WINDOW, CONTRACTOR_REPLIES_PER_WINDOW } from "./bounds";
import { contractorHasActiveAccount } from "./load";
import { loadPortalItem, loadPortalWork, findWorkFile, portalWaitingRows } from "./portal-read";
import { answerAsContractor, attachAsContractor, moveAsContractor, raiseAsContractor, replyAsContractor } from "./portal-store";
import { itemRef } from "./number";
import { portalGroup } from "./portal";
import { WorkRefused } from "./store";
import type { PortalGroup, WorkItemType, WorkStatus } from "./types";

/**
 * The contractor's work acts and readers against a real database (workspace 3b step 4). The leak is the one failure sharing cannot take back, so each way in has its own test:
 * an unshared item, another contractor's, an unknown one (the one 404, byte for byte), an internal note, a file attached before the share, a staff member's name. Rows the staff side
 * would write are written directly (the triggers still judge every one).
 */

let org: TestOrg;
let projectClassId = "";
const p = { raiser: "", assignee: "", admin: "", admin2: "", outsider: "", manager: "" };
const names: Record<string, string> = {};
let counter = 0;

interface Contractor {
  actor: SupplierActor;
  supplierId: string;
  accountId: string;
  contactName: string;
}
async function contractor(opts: { supplierId?: string } = {}): Promise<Contractor> {
  const s = await makeSupplierAccount(org.organisationId, opts.supplierId ? { supplierId: opts.supplierId } : {});
  await db.supplier.update({ where: { id: s.supplier.id }, data: { status: "REGISTERED", registeredOn: D("2025-01-01") } });
  const actor: SupplierActor = {
    kind: "SUPPLIER",
    accountId: s.account!.id,
    sessionId: `ses_${s.account!.id}`,
    contactId: s.contact.id,
    displayName: s.contact.name,
    supplierId: s.supplier.id,
    supplierName: s.supplier.registeredName,
    loginName: s.loginName,
    organisationId: org.organisationId,
    organisationTimeZone: "Asia/Kuala_Lumpur",
    stepUpAt: null,
    sessionCreatedAt: new Date(),
    sourceAddress: "203.0.113.9",
    mustChangePassword: false,
    resetNoticePending: false,
  };
  return { actor, supplierId: s.supplier.id, accountId: s.account!.id, contactName: s.contact.name };
}

/// A contract whose award names this supplier, with the S.O. (`org.so`) as the lead.
async function held(c: Contractor, o: TestOrg = org): Promise<TestContract> {
  const k = await activeContract(o);
  await db.award.updateMany({ where: { exerciseId: k.exerciseId }, data: { vendorId: c.supplierId } });
  accountOf = c.accountId;
  return k;
}

const team = (contractId: string, role: "PROJECT_MANAGER" | "SITE_ENGINEER" | "CONTRACT_ADMINISTRATOR" | "CONSULTANT", personId: string) =>
  db.projectTeamMember.create({ data: { organisationId: org.organisationId, contractId, role, personId, addedByPersonId: org.so, recordedAt: new Date() } });

interface MakeItem {
  type?: WorkItemType;
  status?: WorkStatus;
  shared?: Date | null;
  raiser?: "staff" | "contractor";
  assignee?: "staff" | "contractor" | null;
  answer?: string;
  title?: string;
}
let accountOf = "";
/// An item written directly, as the staff's and the contractor's acts leave it.
async function item(contractId: string, o: MakeItem = {}) {
  const type = o.type ?? "RFI";
  const max = (await db.workItem.aggregate({ where: { contractId, type }, _max: { number: true } }))._max.number ?? 0;
  const status = o.status ?? "TO_DO";
  const shared = o.shared === undefined ? new Date(Date.now() - 3_600_000) : o.shared;
  return db.workItem.create({
    data: {
      organisationId: org.organisationId,
      contractId,
      type,
      number: max + 1,
      title: o.title ?? `Item ${++counter}`,
      status,
      closedAt: status === "DONE" || status === "CANCELLED" ? new Date() : null,
      dueOn: type === "RFI" ? D(today()) : null,
      raisedByPersonId: o.raiser === "contractor" ? null : p.raiser,
      raisedBySupplierAccountId: o.raiser === "contractor" ? accountOf : null,
      assigneePersonId: o.assignee === "staff" ? p.assignee : null,
      assignedToContractor: o.assignee === "contractor",
      sharedAt: shared,
      inspectionResult: type === "INSPECTION" ? "NOT_YET" : null,
      answer: type === "RFI" ? (o.answer ?? "") : "",
      cancelReason: status === "CANCELLED" ? "x" : "",
      recordedAt: new Date(Date.now() - 7_200_000),
    },
  });
}
const ref = (i: { type: WorkItemType; number: number }) => itemRef(i.type, i.number);

async function stage(accountId: string, name = `site-${++counter}.pdf`) {
  const bytes = new TextEncoder().encode(`%PDF-1.4 work ${randomId()} ${counter}`);
  const sha = createHash("sha256").update(bytes).digest("hex");
  await db.blobContent.createMany({ data: [{ organisationId: org.organisationId, sha256: sha, byteSize: BigInt(bytes.length), bytes, storedAt: new Date() }], skipDuplicates: true });
  const doc = await db.document.create({ data: { organisationId: org.organisationId, title: name, documentClassId: projectClassId, classificationSnapshot: "INTERNAL", retentionSnapshot: {}, stagedFor: "work-item" } });
  return (await db.documentVersion.create({ data: { organisationId: org.organisationId, documentId: doc.id, versionNo: 1, sha256: sha, byteSize: BigInt(bytes.length), mediaType: "application/pdf", originalFilename: name, recordedBySupplierAccountId: accountId, storedAt: new Date() } })).id;
}
/// A file a staff member attached, directly: filed, pinned at `at`.
async function staffFile(itemId: string, at: Date) {
  const bytes = new TextEncoder().encode(`%PDF-1.4 staff ${randomId()} ${++counter}`);
  const sha = createHash("sha256").update(bytes).digest("hex");
  await db.blobContent.createMany({ data: [{ organisationId: org.organisationId, sha256: sha, byteSize: BigInt(bytes.length), bytes, storedAt: new Date() }], skipDuplicates: true });
  const doc = await db.document.create({ data: { organisationId: org.organisationId, title: "staff.pdf", documentClassId: projectClassId, classificationSnapshot: "INTERNAL", retentionSnapshot: {}, status: "FILED", filedAt: new Date(), stagedFor: "work-item" } });
  const v = await db.documentVersion.create({ data: { organisationId: org.organisationId, documentId: doc.id, versionNo: 1, sha256: sha, byteSize: BigInt(bytes.length), mediaType: "application/pdf", originalFilename: "staff.pdf", recordedByPersonId: p.raiser, storedAt: new Date() } });
  return db.documentAttachment.create({ data: { organisationId: org.organisationId, purpose: "WORK_ITEM_FILE", versionId: v.id, workItemId: itemId, attachedAt: at } });
}

const refusal = async (promise: Promise<unknown>): Promise<WorkRefused | ProjectRefused> => {
  const e = await promise.then(() => null, (x) => x);
  expect(e, "expected a refusal").toSatisfy((x: unknown) => x instanceof WorkRefused || x instanceof ProjectRefused);
  return e as WorkRefused | ProjectRefused;
};
/// A refusal as the route answers it: status and body.
const answered = async (promise: Promise<unknown>) => {
  const r = refusalReply(await refusal(promise))!;
  return { status: r.status, body: await r.text() };
};
const noticesOf = (subjectId: string) => db.staffNotice.findMany({ where: { organisationId: org.organisationId, subjectId }, select: { recipientPersonId: true, kind: true, body: true, title: true }, orderBy: [{ kind: "asc" }, { recipientPersonId: "asc" }] });

const RAISE = (contractId: string, o: Partial<Parameters<typeof parseRaiseBody>[0]> = {}) => {
  const r = parseRaiseBody({ contractId, type: "RFI", title: `Question ${++counter}`, dueOn: today(), ...o });
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.value;
};
const REPLY = (contractId: string, itemRef: string, body = "Noted.") => {
  const r = parseReplyBody({ contractId, item: itemRef, body });
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.value;
};
const MOVE = (contractId: string, itemRef: string, action: string, expectedFrom: string, comment = "") => {
  const r = parseMoveBody({ contractId, item: itemRef, action, expectedFrom, comment });
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.value;
};

beforeAll(async () => {
  org = await contractOrg("PWK");
  for (const key of Object.keys(p) as (keyof typeof p)[]) {
    names[key] = `${key} ${randomId()}`;
    p[key] = (await makePerson(org.organisationId, names[key])).id;
  }
  projectClassId = (await db.documentClass.create({ data: { organisationId: org.organisationId, code: `pwk_project_${randomId()}`, nameEn: "Project files", classification: "INTERNAL" } })).id;
  await db.documentStorePolicy.upsert({ where: { organisationId: org.organisationId }, update: { projectDocumentClassId: projectClassId }, create: { organisationId: org.organisationId, allowedMediaTypes: ["application/pdf"], maxBytes: BigInt(10_000_000), projectDocumentClassId: projectClassId } });
});

describe("raising (B-15, B-16, B-17)", () => {
  it("numbers under the contract's lock (two at once get 1 and 2), shares at creation, records the account, audits it as the supplier, and names no contact", async () => {
    const c = await contractor();
    const k = await held(c);
    const [a, b] = await Promise.all([raiseAsContractor(c.actor, RAISE(k.contractId)), raiseAsContractor(c.actor, RAISE(k.contractId))]);
    expect([a.ref, b.ref].sort()).toEqual(["RFI-1", "RFI-2"]);
    const row = await db.workItem.findUniqueOrThrow({ where: { id: a.id } });
    expect(row).toMatchObject({ raisedBySupplierAccountId: c.accountId, raisedByPersonId: null, type: "RFI", status: "TO_DO" });
    expect(row.sharedAt).not.toBeNull();
    const audits = await db.auditEntry.findMany({ where: { organisationId: org.organisationId, entityId: a.id } });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ actorKind: "SUPPLIER", action: "CREATE" });
    expect(JSON.stringify(audits[0])).not.toContain(c.contactName);
  });

  it("an RFI goes to the one Contract administrator and tells them and the lead; several or none leaves it unassigned and tells every holder, or the lead; an incident goes to the lead", async () => {
    const c = await contractor();
    const one = await held(c);
    await team(one.contractId, "CONTRACT_ADMINISTRATOR", p.admin);
    const r1 = await raiseAsContractor(c.actor, RAISE(one.contractId));
    expect((await db.workItem.findUniqueOrThrow({ where: { id: r1.id } })).assigneePersonId).toBe(p.admin);
    const told1 = await noticesOf(r1.id);
    expect(told1.map((n) => n.recipientPersonId).sort()).toEqual([p.admin, org.so].sort());
    expect(new Set(told1.map((n) => n.kind))).toEqual(new Set(["WORK_ITEM_FROM_CONTRACTOR"]));

    const two = await held(c);
    await team(two.contractId, "CONTRACT_ADMINISTRATOR", p.admin);
    await team(two.contractId, "CONTRACT_ADMINISTRATOR", p.admin2);
    const r2 = await raiseAsContractor(c.actor, RAISE(two.contractId));
    expect((await db.workItem.findUniqueOrThrow({ where: { id: r2.id } })).assigneePersonId).toBeNull();
    expect((await noticesOf(r2.id)).map((n) => n.recipientPersonId).sort()).toEqual([p.admin, p.admin2, org.so].sort());

    const none = await held(c);
    const r3 = await raiseAsContractor(c.actor, RAISE(none.contractId));
    expect((await db.workItem.findUniqueOrThrow({ where: { id: r3.id } })).assigneePersonId).toBeNull();
    expect((await noticesOf(r3.id)).map((n) => n.recipientPersonId)).toEqual([org.so]);

    const inc = await raiseAsContractor(c.actor, RAISE(none.contractId, { type: "SAFETY_INCIDENT", dueOn: "", severity: "NEAR_MISS", happenedAt: `${today()}T00:01` }));
    const incident = await db.workItem.findUniqueOrThrow({ where: { id: inc.id } });
    expect([incident.type, incident.assigneePersonId, incident.severity]).toEqual(["SAFETY_INCIDENT", org.so, "NEAR_MISS"]);
    // No notice body holds the awardee's name or a contact's.
    for (const n of [...(await noticesOf(r1.id)), ...(await noticesOf(inc.id))]) expect(`${n.title} ${n.body}`).not.toMatch(/A Contractor|Contact /);
  });

  it("refuses an RFI with no date, an incident in the future, and files staged by someone else; and writes nothing", async () => {
    const c = await contractor();
    const other = await contractor();
    const k = await held(c);
    const before = await db.workItem.count({ where: { contractId: k.contractId } });
    expect((await refusal(raiseAsContractor(c.actor, RAISE(k.contractId, { dueOn: "" })))).message).toContain("Pick a due date.");
    expect((await refusal(raiseAsContractor(c.actor, RAISE(k.contractId, { type: "SAFETY_INCIDENT", dueOn: "", severity: "NEAR_MISS", happenedAt: "2099-01-01T10:00" })))).message).toContain("hasn't come yet");
    expect((await refusal(raiseAsContractor(c.actor, { ...RAISE(k.contractId), stagedVersionIds: [await stage(other.accountId)] }))).message).toMatch(/not found|someone else/);
    expect(await db.workItem.count({ where: { contractId: k.contractId } })).toBe(before);
  });

  it("pins the files staged beforehand to the new item, as the contractor's own", async () => {
    const c = await contractor();
    const k = await held(c);
    const r = await raiseAsContractor(c.actor, { ...RAISE(k.contractId), stagedVersionIds: [await stage(c.accountId)] });
    expect(await db.documentAttachment.count({ where: { workItemId: r.id, purpose: "WORK_ITEM_FILE" } })).toBe(1);
    expect((await loadPortalItem(c.actor, k.contractId, r.ref))!.files).toHaveLength(1);
  });

  it("is refused with no time zone (the standing bar, which cannot be judged without one, answers before DAY_NOT_KNOWN), and writes nothing", async () => {
    const o2 = await contractOrg("PWZ");
    await db.organisation.update({ where: { id: o2.organisationId }, data: { timeZone: null } });
    const s = await makeSupplierAccount(o2.organisationId);
    await db.supplier.update({ where: { id: s.supplier.id }, data: { status: "REGISTERED", registeredOn: D("2025-01-01") } });
    const k = await activeContract(o2);
    await db.award.updateMany({ where: { exerciseId: k.exerciseId }, data: { vendorId: s.supplier.id } });
    const actor = { kind: "SUPPLIER", accountId: s.account!.id, sessionId: "s", contactId: s.contact.id, displayName: "x", supplierId: s.supplier.id, supplierName: "x", loginName: s.loginName, organisationId: o2.organisationId, organisationTimeZone: null, stepUpAt: null, sessionCreatedAt: new Date(), sourceAddress: "203.0.113.9", mustChangePassword: false, resetNoticePending: false } as unknown as SupplierActor;
    const e = (await refusal(raiseAsContractor(actor, RAISE(k.contractId)))) as ProjectRefused;
    // With no zone the standing bar (`portalStandingBarOf`: NOT_JUDGED) is asked before the day, for every portal act: so DAY_NOT_KNOWN is never what a contractor sees.
    expect(e.faults.map((f) => f.code)).toEqual(["SUPPLIER_STANDING_BARS"]);
    expect(await db.workItem.count({ where: { contractId: k.contractId } })).toBe(0);
  });
});

describe("files, from the upload to the page", () => {
  it("a file stored by the work upload (staged for a work item, by the account) is attached by the contractor, listed, and downloadable from the store", async () => {
    const c = await contractor();
    const k = await held(c);
    const it0 = await item(k.contractId);
    const pre = await preflightProjectUpload(c.actor, k.contractId, { act: "WORK_ITEM" });
    if (!pre.ok) throw new Error(JSON.stringify(pre.outcome));
    const bytes = new TextEncoder().encode(`%PDF-1.4 upload ${randomId()}`);
    const stored = await storeProjectFile(c.actor, { org: pre.value.org, store: pre.value.store, classId: pre.value.classId, bytes, sha256: sha256Hex(bytes), mediaType: "application/pdf", originalFilename: "level.pdf", stagedFor: STAGED_FOR_WORK_ITEM });
    const version = await db.documentVersion.findUniqueOrThrow({ where: { id: stored.versionId }, include: { document: true } });
    expect(version).toMatchObject({ recordedBySupplierAccountId: c.accountId, recordedByPersonId: null });
    expect(version.document).toMatchObject({ stagedFor: "work-item", status: "STAGED" });
    await attachAsContractor(c.actor, { contractId: k.contractId, item: ref(it0), stagedVersionIds: [stored.versionId] });
    const seen = (await loadPortalItem(c.actor, k.contractId, ref(it0)))!.files;
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ filename: "level.pdf", byYou: true });
    const found = await findWorkFile(db, c.actor, seen[0].attachmentId);
    expect(found).toMatchObject({ ok: true });
    const store = blobStore();
    if ("fault" in store) throw new Error("no store");
    expect(sha256Hex((await store.store.get((await documentOrg(org.organisationId))!.id, (found as { file: { sha256: string } }).file.sha256))!)).toBe(sha256Hex(bytes));
    // It is filed now, and cannot be attached twice.
    expect((await refusal(attachAsContractor(c.actor, { contractId: k.contractId, item: ref(it0), stagedVersionIds: [stored.versionId] }))).message).toMatch(/not found|already attached/);
  });
});

describe("the portal account flag", () => {
  it("contractorHasActiveAccount: true with an active account on the awardee's supplier, false with no supplier or no account", async () => {
    const c = await contractor();
    const k = await held(c);
    expect(await contractorHasActiveAccount(db, (await loadContract(org.organisationId, k.contractId))!)).toBe(true);
    const bare = await activeContract(org);
    expect(await contractorHasActiveAccount(db, (await loadContract(org.organisationId, bare.contractId))!)).toBe(false);
    await db.supplierAccount.update({ where: { id: c.accountId }, data: { status: "DISABLED", disabledAt: new Date(), disabledReason: "test" } });
    expect(await contractorHasActiveAccount(db, (await loadContract(org.organisationId, k.contractId))!)).toBe(false);
  });
});

describe("the throttle (B-14)", () => {
  it("allows 20 raises an hour per account and refuses the 21st with 429, naming the limit; a raise older than the window does not count; another account is unaffected", async () => {
    const c = await contractor();
    const other = await contractor();
    const k = await held(c);
    await db.workItem.createMany({
      data: Array.from({ length: CONTRACTOR_RAISES_PER_WINDOW }, (_, n) => ({ organisationId: org.organisationId, contractId: k.contractId, type: "RFI" as const, number: n + 1, title: `Seed ${n}`, dueOn: D(today()), raisedBySupplierAccountId: c.accountId, sharedAt: new Date(), recordedAt: new Date(Date.now() - (n === 0 ? 61 : 1 + n) * 60_000) })),
    });
    // The oldest is outside the window, so 19 count: the 20th is allowed, the 21st is not.
    await raiseAsContractor(c.actor, RAISE(k.contractId));
    const e = await refusal(raiseAsContractor(c.actor, RAISE(k.contractId)));
    expect(e).toMatchObject({ status: 429 });
    expect(e.message).toMatch(/raise 20 items in 60 minutes\. Try again in \d+ minute/);
    expect(await db.workItem.count({ where: { contractId: k.contractId } })).toBe(CONTRACTOR_RAISES_PER_WINDOW + 1);
    const k2 = await held(other);
    await raiseAsContractor(other.actor, RAISE(k2.contractId));
  });

  it("allows 100 replies an hour per account and refuses the 101st with 429", async () => {
    const c = await contractor();
    const k = await held(c);
    const it0 = await item(k.contractId);
    await db.workItemComment.createMany({ data: Array.from({ length: CONTRACTOR_REPLIES_PER_WINDOW }, (_, n) => ({ organisationId: org.organisationId, workItemId: it0.id, body: `r${n}`, internal: false, supplierAccountId: c.accountId, recordedAt: new Date(Date.now() - 60_000) })) });
    const e = await refusal(replyAsContractor(c.actor, REPLY(k.contractId, ref(it0))));
    expect(e).toMatchObject({ status: 429 });
    expect(e.message).toMatch(/send 100 replies in 60 minutes/);
  });
});

describe("replying, answering, moving", () => {
  it("a reply is a Reply (never internal), attributed to the account, audited as the supplier, and tells the staff raiser and assignee, not the actor's own side", async () => {
    const c = await contractor();
    const k = await held(c);
    const it0 = await item(k.contractId, { assignee: "staff" });
    const r = await replyAsContractor(c.actor, REPLY(k.contractId, ref(it0), "Please confirm the level."));
    const row = await db.workItemComment.findUniqueOrThrow({ where: { id: r.id } });
    expect(row).toMatchObject({ internal: false, supplierAccountId: c.accountId, personId: null });
    expect((await noticesOf(it0.id)).map((n) => [n.kind, n.recipientPersonId])).toEqual([["WORK_ITEM_FROM_CONTRACTOR", p.raiser], ["WORK_ITEM_FROM_CONTRACTOR", p.assignee]].sort((a, b) => a[1].localeCompare(b[1])));
    expect(await db.auditEntry.count({ where: { organisationId: org.organisationId, entityId: r.id, actorKind: "SUPPLIER" } })).toBe(1);
  });

  it("a reply in the second after a pushed sharedAt is refused (not a trigger error), and writes nothing", async () => {
    const c = await contractor();
    const k = await held(c);
    const it0 = await item(k.contractId, { shared: new Date(Date.now() + 5_000) });
    const e = await refusal(replyAsContractor(c.actor, REPLY(k.contractId, ref(it0))));
    expect(e).toMatchObject({ status: 422 });
    expect(e.message).toMatch(/Try again in a moment/);
    expect(await db.workItemComment.count({ where: { workItemId: it0.id } })).toBe(0);
    expect(audienceFaults(it0.sharedAt!.toISOString(), "REPLY", new Date())).toEqual([{ code: "NOT_SHARED" }]);
  });

  it("an RFI the contractor holds: Send for checking needs the answer first; it writes the answer (the only field), sends for checking, tells the staff raiser, and then cannot be edited", async () => {
    const c = await contractor();
    const k = await held(c);
    const it0 = await item(k.contractId, { assignee: "contractor" });
    expect((await refusal(moveAsContractor(c.actor, MOVE(k.contractId, ref(it0), "SEND_FOR_CHECKING", "TO_DO")))).message).toBe("Write the answer first.");
    await answerAsContractor(c.actor, { contractId: k.contractId, item: ref(it0), answer: "Use 20 mm bars." });
    await moveAsContractor(c.actor, MOVE(k.contractId, ref(it0), "SEND_FOR_CHECKING", "TO_DO"));
    const after = await db.workItem.findUniqueOrThrow({ where: { id: it0.id } });
    expect([after.status, after.answer]).toEqual(["IN_REVIEW", "Use 20 mm bars."]);
    expect((await noticesOf(it0.id)).map((n) => [n.kind, n.recipientPersonId])).toEqual([["WORK_ITEM_TO_CHECK", p.raiser]]);
    // Accept answer is the raiser's, and the contractor is not the raiser here.
    expect((await refusal(moveAsContractor(c.actor, MOVE(k.contractId, ref(it0), "ACCEPT_ANSWER", "IN_REVIEW")))).message).toBe("This is not yours to move.");
    // A held item that staff raised: no other field is the contractor's, and a stale view reads MOVED_ALREADY with no one named.
    const stale = await refusal(moveAsContractor(c.actor, MOVE(k.contractId, ref(it0), "SEND_FOR_CHECKING", "TO_DO")));
    expect(stale).toMatchObject({ status: 409 });
    expect(stale.message).not.toContain(names.raiser);
  });

  it("an RFI the contractor raised: Accept answer closes it and tells nobody; Ask again needs words, writes a Reply, goes back to In progress and tells the staff assignee and the lead", async () => {
    const c = await contractor();
    const k = await held(c);
    const done = await item(k.contractId, { raiser: "contractor", assignee: "staff", status: "IN_REVIEW", answer: "Done as drawn." });
    await moveAsContractor(c.actor, MOVE(k.contractId, ref(done), "ACCEPT_ANSWER", "IN_REVIEW"));
    const closed = await db.workItem.findUniqueOrThrow({ where: { id: done.id } });
    expect([closed.status, closed.closedAt !== null]).toEqual(["DONE", true]);
    expect(await noticesOf(done.id)).toEqual([]);

    const again = await item(k.contractId, { raiser: "contractor", assignee: "staff", status: "IN_REVIEW", answer: "Maybe." });
    expect((await refusal(moveAsContractor(c.actor, MOVE(k.contractId, ref(again), "ASK_AGAIN", "IN_REVIEW")))).message).toBe("Say what is still missing.");
    await moveAsContractor(c.actor, MOVE(k.contractId, ref(again), "ASK_AGAIN", "IN_REVIEW", "That does not answer the level."));
    expect((await db.workItem.findUniqueOrThrow({ where: { id: again.id } })).status).toBe("IN_PROGRESS");
    expect(await db.workItemComment.findMany({ where: { workItemId: again.id }, select: { internal: true, supplierAccountId: true } })).toEqual([{ internal: false, supplierAccountId: c.accountId }]);
    expect((await noticesOf(again.id)).map((n) => [n.kind, n.recipientPersonId])).toEqual([["WORK_ITEM_RETURNED", p.assignee], ["WORK_ITEM_RETURNED", org.so]].sort((a, b) => a[1].localeCompare(b[1])));
  });

  it("refusals name no one of the organisation: a move on an item staff hold reads 'not yours'; an Inspection it holds offers Reply, never Send for checking (WB-5)", async () => {
    const c = await contractor();
    const k = await held(c);
    const held0 = await item(k.contractId, { assignee: "staff", status: "IN_PROGRESS" });
    const e = await refusal(moveAsContractor(c.actor, MOVE(k.contractId, ref(held0), "SEND_FOR_CHECKING", "IN_PROGRESS")));
    expect(e.message).toBe("This is not yours to move.");
    for (const key of Object.keys(names)) expect(e.message).not.toContain(names[key]);
    const insp = await item(k.contractId, { type: "INSPECTION", assignee: "contractor" });
    expect((await loadPortalItem(c.actor, k.contractId, ref(insp)))?.row.action).toBe("REPLY");
  });

  it("two accounts accepting the same answer at once: one wins, the other is told it changed", async () => {
    const c = await contractor();
    const c2 = await contractor({ supplierId: c.supplierId });
    const k = await held(c);
    const it0 = await item(k.contractId, { raiser: "contractor", assignee: "staff", status: "IN_REVIEW", answer: "Yes." });
    const results = await Promise.allSettled([moveAsContractor(c.actor, MOVE(k.contractId, ref(it0), "ACCEPT_ANSWER", "IN_REVIEW")), moveAsContractor(c2.actor, MOVE(k.contractId, ref(it0), "ACCEPT_ANSWER", "IN_REVIEW"))]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const lost = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(lost.reason).toMatchObject({ status: 409 });
  });
});

describe("leaks: nothing unshared, another's or internal reaches a contractor", () => {
  it("an unshared item, another contractor's item and an unknown reference answer every act with the one 404, byte for byte", async () => {
    const c = await contractor();
    const rival = await contractor();
    const k = await held(c);
    const rk = await held(rival);
    const unshared = await item(k.contractId, { shared: null, assignee: null });
    const theirs = await item(rk.contractId, { assignee: "contractor" });
    const staged = await stage(c.accountId);
    const attempts = (contractId: string, r: string) => [
      () => replyAsContractor(c.actor, REPLY(contractId, r)),
      () => moveAsContractor(c.actor, MOVE(contractId, r, "SEND_FOR_CHECKING", "TO_DO")),
      () => answerAsContractor(c.actor, { contractId, item: r, answer: "x" }),
      () => attachAsContractor(c.actor, { contractId, item: r, stagedVersionIds: [staged] }),
    ];
    const bodies = new Set<string>();
    for (const [contractId, r] of [[k.contractId, ref(unshared)], [k.contractId, "RFI-999"], [rk.contractId, ref(theirs)], ["cl0000000000000000000000", "RFI-1"]] as const) {
      for (const a of attempts(contractId, r)) {
        const got = await answered(a());
        expect(got.status).toBe(404);
        bodies.add(got.body);
      }
    }
    expect(bodies.size).toBe(1);
    expect(await db.workItemComment.count({ where: { workItemId: { in: [unshared.id, theirs.id] } } })).toBe(0);
    expect(await db.documentAttachment.count({ where: { workItemId: { in: [unshared.id, theirs.id] } } })).toBe(0);
  });

  it("the readers: an unshared item is on no list, the item and the waiting rows; another contractor's contract reads as null", async () => {
    const c = await contractor();
    const rival = await contractor();
    const k = await held(c);
    const rk = await held(rival);
    const unshared = await item(k.contractId, { shared: null, assignee: "staff", title: "Secret internal matter" });
    const sharedHeld = await item(k.contractId, { assignee: "contractor", title: "Visible one" });
    await item(rk.contractId, { assignee: "contractor", title: "Rival's item" });
    const work = (await loadPortalWork(c.actor, k.contractId))!;
    const all = work.groups.flatMap((g) => g.rows);
    expect(all.map((r) => r.title)).toEqual(["Visible one"]);
    expect(JSON.stringify(work)).not.toContain("Secret internal matter");
    expect(await loadPortalItem(c.actor, k.contractId, ref(unshared))).toBeNull();
    expect(await loadPortalWork(c.actor, rk.contractId)).toBeNull();
    expect(await loadPortalItem(c.actor, rk.contractId, "RFI-1")).toBeNull();
    const waiting = await portalWaitingRows(c.actor);
    expect(waiting.rows.map((r) => r.title)).toEqual(["Visible one"]);
    expect(waiting.rows[0].href).toContain(`item=${encodeURIComponent(ref(sharedHeld))}`);
    // WSEC-10 L1: the row's key is the contract and the reference, never the item's internal id; the label is the type word and number.
    expect(waiting.rows[0].documentId).toBe(`work-${k.contractId}-${ref(sharedHeld)}`);
    expect(waiting.rows[0].documentId).not.toContain(sharedHeld.id);
    expect(waiting.rows[0].kindLabel).toBe(`RFI ${sharedHeld.number}`);
    // Each row sits in the group the pure rule says.
    for (const g of work.groups) for (const r of g.rows) expect(r.group).toBe(g.group satisfies PortalGroup);
    const raw = await db.workItem.findUniqueOrThrow({ where: { id: sharedHeld.id } });
    expect(portalGroup({ id: raw.id, type: raw.type, number: raw.number, status: raw.status, raisedBy: { kind: "PERSON", id: p.raiser }, assignee: { kind: "CONTRACTOR" }, sharedAt: raw.sharedAt!.toISOString(), dueOn: null, answer: "", inspectionResult: null })).toBe("WAITING_FOR_YOU");
  });

  it("an internal note never appears in any reader; a staff reply does; a comment written before the share keeps its audience when the item is shared later", async () => {
    const c = await contractor();
    const k = await held(c);
    // Unshared first: the internal note is written while the item is internal, and the share comes after it (the test's name, which it did not do before).
    const it0 = await item(k.contractId, { shared: null });
    await db.workItemComment.create({ data: { organisationId: org.organisationId, workItemId: it0.id, body: "INTERNAL: do not tell the contractor", internal: true, personId: p.raiser, recordedAt: new Date(Date.now() - 60_000) } });
    expect(await loadPortalItem(c.actor, k.contractId, ref(it0))).toBeNull();
    await db.workItem.update({ where: { id: it0.id }, data: { sharedAt: new Date(Date.now() - 45_000) } });
    await db.workItemComment.create({ data: { organisationId: org.organisationId, workItemId: it0.id, body: "We are checking.", internal: false, personId: p.raiser, recordedAt: new Date(Date.now() - 30_000) } });
    const seen = (await loadPortalItem(c.actor, k.contractId, ref(it0)))!;
    expect(seen.comments.map((x) => x.body)).toEqual(["We are checking."]);
    expect(JSON.stringify(seen)).not.toContain("INTERNAL");
    expect(JSON.stringify(await loadPortalWork(c.actor, k.contractId))).not.toContain("INTERNAL");
  });

  it("a staff member is named only if on the Project team; anyone else reads as the organisation; the contractor's own reads 'You'", async () => {
    const c = await contractor();
    const k = await held(c);
    await team(k.contractId, "SITE_ENGINEER", p.assignee);
    const onTeam = await item(k.contractId, { assignee: "staff" });
    const raw = await item(k.contractId);
    await db.workItem.update({ where: { id: raw.id }, data: { assigneePersonId: p.outsider } });
    await db.workItemComment.create({ data: { organisationId: org.organisationId, workItemId: raw.id, body: "From an outsider", internal: false, personId: p.outsider, recordedAt: new Date(Date.now() - 30_000) } });
    const named = (await loadPortalItem(c.actor, k.contractId, ref(onTeam)))!;
    expect(named.row.heldBy).toBe(names.assignee);
    const unnamed = (await loadPortalItem(c.actor, k.contractId, ref(raw)))!;
    const orgName = unnamed.orgName;
    expect(unnamed.row.heldBy).toBe(orgName);
    expect(unnamed.comments.map((x) => x.by)).toEqual([orgName]);
    expect(JSON.stringify(unnamed)).not.toContain(names.outsider);
    await replyAsContractor(c.actor, REPLY(k.contractId, ref(raw), "Thanks."));
    expect((await loadPortalItem(c.actor, k.contractId, ref(raw)))!.comments.map((x) => x.by)).toEqual([orgName, "You"]);
  });

  it("a file attached before the share is neither listed nor downloadable; one attached after is; the contractor's own always is (including on a contract it does not hold: 404)", async () => {
    const c = await contractor();
    const rival = await contractor();
    const k = await held(c);
    const sharedAt = new Date(Date.now() - 60_000);
    const it0 = await item(k.contractId, { shared: sharedAt });
    const before = await staffFile(it0.id, new Date(sharedAt.getTime() - 60_000));
    const sameSecond = await staffFile(it0.id, new Date(sharedAt.getTime() - 1));
    const after = await staffFile(it0.id, new Date(sharedAt.getTime() + 60_000));
    await attachAsContractor(c.actor, { contractId: k.contractId, item: ref(it0), stagedVersionIds: [await stage(c.accountId, "mine.pdf")] });
    const seen = (await loadPortalItem(c.actor, k.contractId, ref(it0)))!;
    expect(seen.files.map((f) => f.attachmentId).sort()).toEqual([after.id, ...(await db.documentAttachment.findMany({ where: { workItemId: it0.id, version: { recordedBySupplierAccountId: c.accountId } }, select: { id: true } })).map((x) => x.id)].sort());
    expect(seen.files.every((f) => f.href.endsWith(f.attachmentId))).toBe(true);
    for (const hidden of [before, sameSecond]) expect(await findWorkFile(db, c.actor, hidden.id)).toMatchObject({ ok: false, status: 404 });
    expect(await findWorkFile(db, c.actor, after.id)).toMatchObject({ ok: true });
    for (const f of seen.files) expect(await findWorkFile(db, c.actor, f.attachmentId)).toMatchObject({ ok: true });
    expect(await findWorkFile(db, rival.actor, after.id)).toMatchObject({ ok: false, status: 404 });
    // Unshared item: the file is 404 though it exists.
    const hiddenItem = await item(k.contractId, { shared: null });
    const pinned = await staffFile(hiddenItem.id, new Date());
    expect(await findWorkFile(db, c.actor, pinned.id)).toMatchObject({ ok: false, status: 404 });
    expect(portalSeesFile({ attachedAt: new Date(), byContractor: true }, null)).toBe(false);
  });

  it("attaching refuses another account's staged file and a file not staged for a work item, in words that say so", async () => {
    const c = await contractor();
    const other = await contractor();
    const k = await held(c);
    const it0 = await item(k.contractId);
    expect((await refusal(attachAsContractor(c.actor, { contractId: k.contractId, item: ref(it0), stagedVersionIds: [await stage(other.accountId)] }))).message).toMatch(/not found/);
    const wrong = await stage(c.accountId);
    await db.document.updateMany({ where: { versions: { some: { id: wrong } } }, data: { stagedFor: "project-document" } });
    expect((await refusal(attachAsContractor(c.actor, { contractId: k.contractId, item: ref(it0), stagedVersionIds: [wrong] }))).message).toMatch(/not found/);
    expect(await db.documentAttachment.count({ where: { workItemId: it0.id } })).toBe(0);
  });

  it("the edge refuses unknown fields and a status the item is to take, with field-level detail", () => {
    const m = parseMoveBody({ contractId: "cl0000000000000000000000", item: "RFI-1", action: "CANCEL", expectedFrom: "TO_DO", to: "DONE" });
    expect(m).toMatchObject({ ok: false, errors: { to: "Not a field of this request.", action: expect.any(String) } });
    expect(parseReplyBody({ contractId: "cl0000000000000000000000", item: "RFI-1", body: "x", internal: true })).toMatchObject({ ok: false, errors: { internal: "Not a field of this request." } });
    expect(parseAnswerBody({ contractId: "short", item: "nope", answer: 5 })).toMatchObject({ ok: false });
    expect(parseAttachBody({ contractId: "cl0000000000000000000000", item: "RFI-1", stagedVersionIds: [] })).toMatchObject({ ok: false, errors: { stagedVersionIds: "Choose a file first." } });
    expect(parseRaiseBody({ contractId: "cl0000000000000000000000", type: "TASK", title: "x" })).toMatchObject({ ok: false, errors: { type: expect.any(String) } });
  });
});

describe("the contract's state", () => {
  it("a cancelled contract refuses every act in the act x status table's words", async () => {
    const c = await contractor();
    const k = await held(c);
    await db.contract.update({ where: { id: k.contractId }, data: { status: "CANCELLED" } });
    const it0 = await item(k.contractId);
    expect((await refusal(replyAsContractor(c.actor, REPLY(k.contractId, ref(it0))))).message).toBeTruthy();
    expect(await db.workItemComment.count({ where: { workItemId: it0.id } })).toBe(0);
  });
});

// ------------------------------------------------------------------------------------------------ the security audit's fixes

describe("3b security (WSEC-5): the contractor does not reply, attach or answer on a closed item", () => {
  it("a Done or Cancelled item refuses a reply, a file and an answer in words that name no one and tell the contractor what to do; nothing is written", async () => {
    const c = await contractor();
    const k = await held(c);
    for (const status of ["DONE", "CANCELLED"] as const) {
      const it0 = await item(k.contractId, { assignee: "contractor", status, answer: "Level 2.1" });
      const staged = await stage(c.accountId);
      const attempts = [
        () => replyAsContractor(c.actor, REPLY(k.contractId, ref(it0))),
        () => attachAsContractor(c.actor, { contractId: k.contractId, item: ref(it0), stagedVersionIds: [staged] }),
        () => answerAsContractor(c.actor, { contractId: k.contractId, item: ref(it0), answer: "A changed answer" }),
      ];
      for (const a of attempts) {
        const e = await refusal(a());
        expect(e, status).toMatchObject({ status: 422 });
        expect(e.message).toBe("This is closed. If something is still open, raise a new item.");
        for (const key of Object.keys(names)) expect(e.message).not.toContain(names[key]);
      }
      expect(await db.workItemComment.count({ where: { workItemId: it0.id } })).toBe(0);
      expect(await db.documentAttachment.count({ where: { workItemId: it0.id } })).toBe(0);
      expect((await db.workItem.findUniqueOrThrow({ where: { id: it0.id } })).answer).toBe("Level 2.1");
      // The drawer is told: no control that is always refused.
      const seen = (await loadPortalItem(c.actor, k.contractId, ref(it0)))!;
      expect([seen.mayPost, seen.mayAnswer]).toEqual([false, false]);
    }
    const open = await item(k.contractId, { assignee: "contractor" });
    expect((await loadPortalItem(c.actor, k.contractId, ref(open)))!.mayPost).toBe(true);
    await replyAsContractor(c.actor, REPLY(k.contractId, ref(open)));
  });
});

describe("3b security (WSEC-7): the throttle is the company's on the contract, across its accounts, and an answer edit is a reply", () => {
  const seedReplies = (itemId: string, accountId: string, n: number) =>
    db.workItemComment.createMany({ data: Array.from({ length: n }, (_, i) => ({ organisationId: org.organisationId, workItemId: itemId, body: `r${i}`, internal: false, supplierAccountId: accountId, recordedAt: new Date(Date.now() - 60_000) })) });

  it("replies by another account of the same supplier count toward the bound; another contract of the same supplier does not", async () => {
    const c = await contractor();
    const c2 = await contractor({ supplierId: c.supplierId });
    const k = await held(c);
    const it0 = await item(k.contractId);
    await seedReplies(it0.id, c2.accountId, CONTRACTOR_REPLIES_PER_WINDOW);
    const e = await refusal(replyAsContractor(c.actor, REPLY(k.contractId, ref(it0))));
    expect(e).toMatchObject({ status: 429 });
    expect(e.message).toMatch(/send 100 replies in 60 minutes/);
    // The same company on another contract it holds has its own count.
    const k2 = await held(c);
    const other = await item(k2.contractId);
    await replyAsContractor(c.actor, REPLY(k2.contractId, ref(other)));
  });

  it("raises by another account of the same supplier count toward the bound", async () => {
    const c = await contractor();
    const c2 = await contractor({ supplierId: c.supplierId });
    const k = await held(c);
    await db.workItem.createMany({
      data: Array.from({ length: CONTRACTOR_RAISES_PER_WINDOW }, (_, n) => ({ organisationId: org.organisationId, contractId: k.contractId, type: "RFI" as const, number: n + 1, title: `Seed ${n}`, dueOn: D(today()), raisedBySupplierAccountId: c2.accountId, sharedAt: new Date(), recordedAt: new Date(Date.now() - (1 + n) * 60_000 + 30_000) })),
    });
    const e = await refusal(raiseAsContractor(c.actor, RAISE(k.contractId)));
    expect(e).toMatchObject({ status: 429 });
    expect(e.message).toMatch(/raise 20 items in 60 minutes/);
  });

  it("two accounts of one supplier replying at once with one place left: exactly one is let through (the contract's lock)", async () => {
    const c = await contractor();
    const c2 = await contractor({ supplierId: c.supplierId });
    const k = await held(c);
    const it0 = await item(k.contractId);
    await seedReplies(it0.id, c.accountId, CONTRACTOR_REPLIES_PER_WINDOW - 1);
    const results = await Promise.allSettled([replyAsContractor(c.actor, REPLY(k.contractId, ref(it0), "From the first")), replyAsContractor(c2.actor, REPLY(k.contractId, ref(it0), "From the second"))]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason).toMatchObject({ status: 429 });
    expect(await db.workItemComment.count({ where: { workItemId: it0.id, supplierAccountId: { in: [c.accountId, c2.accountId] } } })).toBe(CONTRACTOR_REPLIES_PER_WINDOW);
  });

  it("two accounts raising at once with one place left: exactly one is let through", async () => {
    const c = await contractor();
    const c2 = await contractor({ supplierId: c.supplierId });
    const k = await held(c);
    await db.workItem.createMany({
      data: Array.from({ length: CONTRACTOR_RAISES_PER_WINDOW - 1 }, (_, n) => ({ organisationId: org.organisationId, contractId: k.contractId, type: "RFI" as const, number: n + 1, title: `Seed ${n}`, dueOn: D(today()), raisedBySupplierAccountId: c.accountId, sharedAt: new Date(), recordedAt: new Date(Date.now() - 60_000) })),
    });
    const results = await Promise.allSettled([raiseAsContractor(c.actor, RAISE(k.contractId)), raiseAsContractor(c2.actor, RAISE(k.contractId))]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason).toMatchObject({ status: 429 });
  });

  it("an edit of an RFI's answer counts against the reply bound: the 100th reply-or-edit is let through and the next is refused, by either account; an unchanged answer costs nothing", async () => {
    const c = await contractor();
    const c2 = await contractor({ supplierId: c.supplierId });
    const k = await held(c);
    const mine = await item(k.contractId, { assignee: "contractor" });
    await seedReplies(mine.id, c.accountId, CONTRACTOR_REPLIES_PER_WINDOW - 2);
    await answerAsContractor(c.actor, { contractId: k.contractId, item: ref(mine), answer: "First draft." });
    await answerAsContractor(c2.actor, { contractId: k.contractId, item: ref(mine), answer: "First draft." }); // unchanged: no write, no audit row, no cost
    await answerAsContractor(c2.actor, { contractId: k.contractId, item: ref(mine), answer: "Second draft." });
    const e = await refusal(answerAsContractor(c.actor, { contractId: k.contractId, item: ref(mine), answer: "Third draft." }));
    expect(e).toMatchObject({ status: 429 });
    expect(e.message).toMatch(/send 100 replies in 60 minutes/);
    expect((await db.workItem.findUniqueOrThrow({ where: { id: mine.id } })).answer).toBe("Second draft.");
    expect((await refusal(replyAsContractor(c.actor, REPLY(k.contractId, ref(mine)))))).toMatchObject({ status: 429 });
    expect(await db.auditEntry.count({ where: { entityId: mine.id, actorKind: "SUPPLIER" } })).toBe(2);
  });
});

describe("3b security (WSEC-9, WSEC-10): accepting an answer is audited with its text; the portal reads in the organisation's zone and shows scan labels and no internal priority", () => {
  it("the contractor accepting an answer it was given records the text it accepted on the same audit row", async () => {
    const c = await contractor();
    const k = await held(c);
    const it0 = await item(k.contractId, { raiser: "contractor", assignee: "staff", status: "IN_REVIEW", answer: "Use 20 mm bars." });
    await moveAsContractor(c.actor, MOVE(k.contractId, ref(it0), "ACCEPT_ANSWER", "IN_REVIEW"));
    const row = (await db.auditEntry.findMany({ where: { entityId: it0.id, action: "UPDATE" } }))[0];
    expect(row.changes).toEqual(expect.arrayContaining([{ field: "status", before: "IN_REVIEW", after: "DONE" }, { field: "answerAccepted", before: null, after: "Use 20 mm bars." }]));
  });

  it("the portal's order drops internal priority: two items due together come in reference order whatever staff rated them", async () => {
    const c = await contractor();
    const k = await held(c);
    const first = await item(k.contractId, { assignee: "contractor" });
    const second = await item(k.contractId, { assignee: "contractor" });
    await db.workItem.update({ where: { id: second.id }, data: { priority: "URGENT" } });
    await db.workItem.update({ where: { id: first.id }, data: { priority: "LOW" } });
    const rows = (await loadPortalWork(c.actor, k.contractId))!.groups.find((g) => g.group === "WAITING_FOR_YOU")!.rows;
    expect(rows.map((r) => r.ref)).toEqual([ref(first), ref(second)]);
  });

  it("the work carries the organisation's zone; every file says what its scan says; a row names its type and number, not its key", async () => {
    const c = await contractor();
    const k = await held(c);
    const it0 = await item(k.contractId, { assignee: "contractor", type: "TASK" });
    await attachAsContractor(c.actor, { contractId: k.contractId, item: ref(it0), stagedVersionIds: [await stage(c.accountId, "mine.pdf")] });
    await staffFile(it0.id, new Date());
    const work = (await loadPortalWork(c.actor, k.contractId))!;
    expect(work.timeZone).toBe("Asia/Kuala_Lumpur");
    expect(work.groups.flatMap((g) => g.rows).map((r) => r.label)).toEqual([`Task ${it0.number}`]);
    const seen = (await loadPortalItem(c.actor, k.contractId, ref(it0)))!;
    expect(seen.row.label).toBe(`Task ${it0.number}`);
    expect(seen.files.length).toBe(2);
    expect(seen.files.every((f) => f.scanLabel === "Not scanned for malware")).toBe(true);
  });
});
