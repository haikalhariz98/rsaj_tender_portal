/**
 * The contractor's work acts, as transactional cores (workspace 3b step 4; plan B-14 to B-17; ADR 0049): raise a question or an incident, reply, answer an RFI it holds,
 * attach files, and send for checking / accept the answer / ask again. Words, not signatures: no password is asked (the `reportRectifiedAsContractor` precedent).
 *
 * Each core runs in `inHeldContract`: the contract locked, held by the session's supplier (another's reads as not found), the standing bar applied, and the organisation's day
 * read (a contractor act is refused `DAY_NOT_KNOWN` with no time zone, as every other portal act is). Lock order: the contract, then the `WorkItem` row (`lockedItem`, the staff
 * store's own helper), then the store's documents in id order. The throttle takes no lock of its own: it counts under the contract's lock (WSEC-7). Nothing here locks in another order.
 *
 * Every core: the `WORK_ITEM` row of the act x status table, the item (shared, or it reads as NOT FOUND, the one answer for an unshared item, another contractor's and an unknown
 * one), the pure faults (`moveFaults`, `fieldFaults`, `contractorRaiseFaults`, `commentFaults`, `audienceFaults`, with `side: "CONTRACTOR"`), the guarded write, `writeAudit` with
 * the supplier's audit actor, and `writeNotices` with actor null (the contractor is never told: PW-13). The account columns are records, not signatures: no staff attribution.
 *
 * Nothing in a refusal or an audit row names a staff member or a contact: the staff words that do (`moveFaultText`) are not used, and the audit holds the account by its id only
 * (WS-9, WS-10). A contractor's comment is a Reply, always (`internal: false`, CHECK `WorkItemComment_contractor_replies`).
 */

import { diffFields } from "@/lib/audit/diff";
import { writeAudit } from "@/lib/audit/record";
import type { SupplierActor } from "@/lib/auth/types";
import { actStatusFault, actStatusText } from "@/lib/contract/act-status";
import type { ContractStatus } from "@/lib/contract/types";
import { toSecond } from "@/lib/bids/lateness";
import { dayOrNull, dayToDate } from "@/lib/dates";
import { attachFault } from "@/lib/documents/attach";
import { attached, filed } from "@/lib/documents/audit-view";
import { documentFaultText } from "@/lib/documents/labels";
import { lockDocument } from "@/lib/documents/lock";
import { workItemFacts, workItemLabel } from "@/lib/documents/owner-facts";
import { loadStorePolicy } from "@/lib/documents/service";
import { STAGED_FOR_WORK_ITEM } from "@/lib/documents/staged-for";
import { writeNotices } from "@/lib/inbox/store";
import { stagedFileFaults, type StagedFault, type StagedFile } from "@/lib/project-docs/bounds";
import { contractorMayDownload } from "@/lib/project-docs/visibility";
import { rectifyWithin } from "@/lib/portal/projects/defect-store";
import { inHeldContract, supplierAuditActor } from "@/lib/portal/projects/submission-store";
import { ProjectRefused } from "@/lib/portal/projects/types";
import { projectFaultText } from "@/lib/portal/projects/words";
import type { AnswerBody, AttachBody, MoveBody, RaiseBody, ReplyBody } from "@/lib/portal/projects/work-api";

import { audienceFaults } from "./audience";
import { CONTRACTOR_RAISES_PER_WINDOW, CONTRACTOR_REPLIES_PER_WINDOW, CONTRACTOR_WINDOW_MINUTES, FILES_PER_ACT } from "./bounds";
import { commentFaults, contractorRaiseFaults, fieldFaults, parseFieldEdit, type ContractorRaise } from "./fields";
import { defectActOf } from "./defect-link";
import { fieldFaultText, LINKED_DRAFT_PORTAL_WORDS, portalMoveFaultText } from "./labels";
import { activeAmong, leadOf, loadTeamMembers, workAuditPrefix } from "./load";
import { actionOf, answerAcceptedBy, moveFaults, TARGET } from "./move";
import { nextNumber, itemRef, parseItemRef } from "./number";
import { workNoticeDrafts, type NoticeItem } from "./notices";
import { assigneeOf, personIdOf, raiserOf } from "./party";
import { contractorMayPost } from "./portal";
import { factsOf, lockedItem, WorkRefused, type ItemRow, type WorkCtx } from "./store";
import { defaultAssignee } from "./team";
import type { FieldFault, WorkActor, WorkNoticeKind } from "./types";

/// The contractor as the rules read it: it holds the contract (`inHeldContract` has just said so), it is nobody's lead, and it has no person.
const CONTRACTOR_ACTOR: WorkActor = { side: "CONTRACTOR", personId: null, leadIds: [], mayReadContract: true };

const NOT_FOUND = "That is not something you can open.";
const refuse = (words: string, status: 404 | 409 | 422 | 429 = 422): never => {
  throw new WorkRefused(words, status);
};
const faultsText = (fs: readonly FieldFault[]): string => [...new Set(fs.map(fieldFaultText))].join(" ");

/// Step 1 of every act: the contract's status, said in the act x status table's words.
function gate(c: WorkCtx): void {
  const shut = actStatusFault("WORK_ITEM", c.l.contract.status as ContractStatus);
  if (shut) refuse(actStatusText(shut));
}

/// Run an act in the held contract. The clock is read once, to the second (as the staff acts read it), so a Reply is judged against a share's instant on the same footing.
async function inWork<T>(actor: SupplierActor, contractId: string, fn: (c: WorkCtx) => Promise<T>): Promise<T> {
  const now = toSecond(new Date());
  return inHeldContract(actor, contractId, (tx, l, today) => fn({ tx, l, now, today }), now);
}

const audit = (c: WorkCtx, actor: SupplierActor, row: { type: ItemRow["type"]; number: number }, entity: string, entityId: string, what: string, action: "CREATE" | "UPDATE", changes: ReturnType<typeof diffFields>) =>
  writeAudit(c.tx, { actor: supplierAuditActor(actor), organisationId: c.l.org.id, entity, entityId, entityLabel: workAuditPrefix(c.l.contract.number, row.type, row.number) + what }, action, changes);

// ------------------------------------------------------------------ the item, shared, locked

/// The item an address names, as this contractor may reach it: shared, on the held contract. The id is read before the lock from the item's identity (its contract, type and
/// number never change), and the row is locked and read again; an unshared item, another contract's and an unknown reference are the one 404.
async function sharedItem(c: WorkCtx, ref: string): Promise<ItemRow> {
  const parsed = parseItemRef(ref);
  if (!parsed) return refuse(NOT_FOUND, 404);
  const found = await c.tx.workItem.findFirst({ where: { organisationId: c.l.org.id, contractId: c.l.contract.id, type: parsed.type, number: parsed.number, sharedAt: { not: null } }, select: { id: true } });
  if (!found) return refuse(NOT_FOUND, 404);
  const row = await lockedItem(c, found.id);
  return row.sharedAt === null ? refuse(NOT_FOUND, 404) : row;
}

// ------------------------------------------------------------------ the throttle (B-14)

/**
 * At most `CONTRACTOR_RAISES_PER_WINDOW` raises and `CONTRACTOR_REPLIES_PER_WINDOW` replies per SUPPLIER per CONTRACT per window (WSEC-7): the contractor is a party as the company
 * (ADR 0049 D2), so the bound is the company's however many accounts it signs in with. Counted under the contract's lock the core already holds, so two accounts acting together
 * cannot both pass it; the count is of the rows themselves, so a retried or refused act costs nothing. An edit of an RFI's answer writes an audit row and counts as a reply. A
 * refusal names the limit and when to try again. Ask again's comment is a reply and counts as one.
 */
async function throttle(c: WorkCtx, actor: SupplierActor, kind: "RAISE" | "REPLY"): Promise<void> {
  const since = new Date(c.now.getTime() - CONTRACTOR_WINDOW_MINUTES * 60_000);
  const limit = kind === "RAISE" ? CONTRACTOR_RAISES_PER_WINDOW : CONTRACTOR_REPLIES_PER_WINDOW;
  const org = c.l.org.id;
  const contractId = c.l.contract.id;
  const mine = { supplierId: actor.supplierId };
  let count: number;
  let oldest: Date | null;
  if (kind === "RAISE") {
    const where = { organisationId: org, contractId, sharedAt: { not: null }, recordedAt: { gt: since }, raisedBySupplierAccount: mine };
    const [n, first] = await Promise.all([c.tx.workItem.count({ where }), c.tx.workItem.findFirst({ where, orderBy: { recordedAt: "asc" }, select: { recordedAt: true } })]);
    count = n;
    oldest = first?.recordedAt ?? null;
  } else {
    const commentWhere = { organisationId: org, recordedAt: { gt: since }, workItem: { contractId }, supplierAccount: mine };
    // An answer edit has no row of its own: its audit row, written by one of the company's accounts on an RFI of this contract, is what is counted.
    const [accounts, rfis] = await Promise.all([c.tx.supplierAccount.findMany({ where: { organisationId: org, ...mine }, select: { id: true } }), c.tx.workItem.findMany({ where: { organisationId: org, contractId, sharedAt: { not: null }, type: "RFI" }, select: { id: true } })]);
    const editWhere = { organisationId: org, entity: "WorkItem", entityId: { in: rfis.map((r) => r.id) }, actorKind: "SUPPLIER" as const, actorSupplierAccountId: { in: accounts.map((a) => a.id) }, at: { gt: since }, changes: { array_contains: [{ field: "answer" }] } };
    const [n, firstComment, edits, firstEdit] = await Promise.all([
      c.tx.workItemComment.count({ where: commentWhere }),
      c.tx.workItemComment.findFirst({ where: commentWhere, orderBy: { recordedAt: "asc" }, select: { recordedAt: true } }),
      c.tx.auditEntry.count({ where: editWhere }),
      c.tx.auditEntry.findFirst({ where: editWhere, orderBy: { at: "asc" }, select: { at: true } }),
    ]);
    count = n + edits;
    const times = [firstComment?.recordedAt, firstEdit?.at].filter((t): t is Date => t !== undefined);
    oldest = times.length ? new Date(Math.min(...times.map((t) => t.getTime()))) : null;
  }
  if (count < limit) return;
  const minutes = oldest ? Math.max(1, Math.ceil((oldest.getTime() + CONTRACTOR_WINDOW_MINUTES * 60_000 - c.now.getTime()) / 60_000)) : CONTRACTOR_WINDOW_MINUTES;
  refuse(`You can ${kind === "RAISE" ? `raise ${limit} items` : `send ${limit} replies`} in ${CONTRACTOR_WINDOW_MINUTES} minutes. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`, 429);
}

// ------------------------------------------------------------------ the staff are told (B-17)

type NoticeRow = Pick<ItemRow, "id" | "type" | "number" | "title" | "raisedByPersonId" | "assigneePersonId" | "assignedToContractor">;

/// Tell staff, actor null. The pure rule names the people (`workNoticeDrafts`): the staff raiser and assignee, the role's holders on a raise with no single default
/// assignee, and the lead on every kind on an item the contractor raised. The contractor is never told, and a body holds the reference, title and contract number only.
async function tell(c: WorkCtx, r: NoticeRow, kind: WorkNoticeKind, occurrence: string, roleHolders: readonly string[] = [], alreadyTold: ReadonlySet<string> = new Set()): Promise<void> {
  const raisedBy = raiserOf(r);
  const assignee = assigneeOf(r);
  const lead = await leadOf(c.l, c.today, c.tx);
  const activeIds = await activeAmong(c.tx, c.l.org.id, [personIdOf(raisedBy), personIdOf(assignee), ...lead.ids, ...roleHolders]);
  const item: NoticeItem = { id: r.id, type: r.type, number: r.number, title: r.title, contractId: c.l.contract.id, contractNumber: c.l.contract.number };
  // Once each: a person the defect notice of the same event already told is left out of the work notice (the two are of different kinds, so the table's key would not).
  const drafts = workNoticeDrafts({ kind, actorId: null, raisedBy, assignee, leadIds: lead.ids, roleHolders, occurrence, activeIds }, item).filter((d) => !alreadyTold.has(d.recipientPersonId));
  const wrote = await writeNotices(c.tx, c.l.org.id, null, drafts);
  if (c.told) c.told.count += wrote;
}

// ------------------------------------------------------------------ files

const STAGED_WORDS: Readonly<Record<StagedFault, string>> = {
  DUPLICATE: "A file is listed twice.",
  NOT_STAGED_FOR_PROJECT: "That file was not uploaded for a work item. Upload it again here.",
  NOT_YOURS: "That file was uploaded by someone else. Upload it again here.",
  ALREADY_ATTACHED: "That file is already attached to something.",
  WITHDRAWN: "That file was withdrawn. Upload it again here.",
  WRONG_CLASS: "That file is not in the class for project files. Upload it again here.",
};

/**
 * Pin the actor's own staged files (`STAGED_FOR_WORK_ITEM`, recorded by this account) to an item, in the act's transaction: the staff `attachFiles`' rules for the contractor. Only
 * the account's own staged versions are looked up, so another's id reads as unknown and the faults are no oracle on the store. The class for project files must be set, and a file
 * must be one a contractor may download (a SULIT or unclassified one is refused). The documents are locked in id order, after the item. `attachedAt` is the act's instant, as
 * the staff side writes it; the contractor's own file is always seen by the portal (`portalSeesFile`), so it needs no share instant.
 */
async function pinFiles(c: WorkCtx, actor: SupplierActor, row: Pick<ItemRow, "id" | "type" | "number" | "title">, ids: readonly string[]): Promise<number> {
  if (ids.length === 0) return 0;
  if (ids.length > FILES_PER_ACT) return refuse(`Attach at most ${FILES_PER_ACT} files at a time.`);
  const policy = await loadStorePolicy(c.l.org.id, c.tx);
  if (policy.projectDocumentClassId === null) return refuse(`Files are not set up yet. Ask ${c.l.org.name} to set them up.`);

  const own = { id: { in: [...ids] }, organisationId: c.l.org.id, recordedBySupplierAccountId: actor.accountId, recordedByPersonId: null, document: { stagedFor: STAGED_FOR_WORK_ITEM } };
  const at = await c.tx.documentVersion.findMany({ where: own, select: { documentId: true } });
  for (const documentId of [...new Set(at.map((v) => v.documentId))].sort()) await lockDocument(c.tx, documentId);
  const found = await c.tx.documentVersion.findMany({
    where: own,
    select: {
      id: true,
      documentId: true,
      versionNo: true,
      sha256: true,
      withdrawnAt: true,
      originalFilename: true,
      recordedByPersonId: true,
      recordedBySupplierAccountId: true,
      document: { select: { id: true, title: true, status: true, stagedFor: true, documentClassId: true, classificationSnapshot: true, documentClass: { select: { classification: true } } } },
      _count: { select: { attachments: true } },
    },
  });
  const byId = new Map(found.map((r) => [r.id, r]));
  const facts = { type: row.type, number: row.number, title: row.title, contractId: c.l.contract.id, contract: { status: c.l.contract.status as ContractStatus, number: c.l.contract.number } };
  const owner = workItemFacts(facts);
  const words: string[] = [];
  const known: StagedFile[] = [];
  ids.forEach((id, n) => {
    const r = byId.get(id);
    if (!r) return void words.push(`File ${n + 1} was not found. Upload it again here.`);
    known.push({ versionId: r.id, stagedFor: r.document.stagedFor, recordedByPersonId: r.recordedByPersonId, recordedBySupplierAccountId: r.recordedBySupplierAccountId, attachments: r._count.attachments, withdrawn: r.withdrawnAt !== null, documentClassId: r.document.documentClassId });
    for (const f of attachFault({ purpose: "WORK_ITEM_FILE", owner, version: { withdrawnAt: r.withdrawnAt }, documentClass: r.document.documentClass, documentClassification: r.document.classificationSnapshot, alreadyAttached: false, byOwnerAct: true })) {
      if (f.level === "block" && f.code !== "VERSION_WITHDRAWN") words.push(`File ${n + 1}: ${documentFaultText(f)}`);
    }
    if (!contractorMayDownload({ versionVisible: true, documentClassification: r.document.classificationSnapshot, classClassification: r.document.documentClass.classification })) words.push(`File ${n + 1}: it cannot be shared. Ask ${c.l.org.name}.`);
  });
  for (const f of stagedFileFaults(known, { side: "CONTRACTOR", accountId: actor.accountId }, policy.projectDocumentClassId, STAGED_FOR_WORK_ITEM)) words.push(`File ${Number(f.data?.file ?? 0)}: ${STAGED_WORDS[f.code]}`);
  if (words.length) refuse([...new Set(words)].join(" "));

  const label = workItemLabel(facts);
  for (const id of ids) {
    const r = byId.get(id)!;
    const pinned = await c.tx.documentAttachment.create({ data: { organisationId: c.l.org.id, purpose: "WORK_ITEM_FILE", versionId: r.id, workItemId: row.id, attachedAt: c.now }, select: { id: true } });
    await audit(c, actor, row, "DocumentAttachment", pinned.id, r.originalFilename, "CREATE", attached({ purpose: "WORK_ITEM_FILE", title: r.document.title, versionNo: r.versionNo, sha256: r.sha256, owner: label }));
    if (r.document.status === "STAGED") {
      await c.tx.document.update({ where: { id: r.document.id, organisationId: c.l.org.id }, data: { status: "FILED", filedAt: c.now } });
      await writeAudit(c.tx, { actor: supplierAuditActor(actor), organisationId: c.l.org.id, entity: "Document", entityId: r.document.id, entityLabel: `Document · ${r.document.title}` }, "UPDATE", filed());
    }
  }
  return ids.length;
}

/// Attach files to a shared item the contractor holds the contract of. A file here is the contractor's own, so the portal always lists it.
export function attachAsContractor(actor: SupplierActor, i: AttachBody): Promise<{ count: number }> {
  return inWork(actor, i.contractId, async (c) => {
    gate(c);
    const row = await sharedItem(c, i.item);
    if (!contractorMayPost(row)) return refuse(portalMoveFaultText({ code: "ITEM_CLOSED" }));
    return { count: await pinFiles(c, actor, row, i.stagedVersionIds) };
  });
}

// ------------------------------------------------------------------ raise

/// What the contractor sets when it raises (B-15) as the pure rule reads it: the wall clock of an incident becomes an instant in the organisation's zone.
function raiseOf(i: RaiseBody, timeZone: string | null): ContractorRaise {
  const happened = i.happenedAt === "" ? null : parseFieldEdit("happenedAt", i.happenedAt, timeZone);
  return {
    type: i.type,
    title: i.title,
    description: i.description,
    location: i.location,
    dueOn: i.dueOn === "" ? null : i.dueOn,
    severity: i.severity === "" ? null : i.severity,
    happenedAt: happened?.field === "happenedAt" ? happened.value : null,
  };
}

/**
 * "Ask a question" (an RFI) or "Report an incident" (a safety incident): numbered under the contract's lock, shared at creation, raised by the account. The default assignee is the
 * Contract administrator for an RFI and the lead for an incident (`defaultAssignee`, B-16): exactly one holder is assigned; several or none leaves it unassigned and tells the
 * holders (or the lead). The lead is told on every raise (WS-17). Files staged beforehand are pinned in the same act.
 */
export function raiseAsContractor(actor: SupplierActor, i: RaiseBody): Promise<{ id: string; ref: string }> {
  return inWork(actor, i.contractId, async (c) => {
    gate(c);
    await throttle(c, actor, "RAISE");
    const r = raiseOf(i, c.l.org.timeZone);
    const faults = contractorRaiseFaults(r, { now: c.now, timeZone: c.l.org.timeZone });
    if (faults.length) refuse(faultsText(faults));

    const org = c.l.org.id;
    // Numbered over EVERY item of the type, shared or not: the number is unique per contract and type (the key), so an unshared item's number must not be reused.
    const max = (await c.tx.workItem.aggregate({ where: { contractId: c.l.contract.id, organisationId: org, type: r.type }, _max: { number: true } }))._max.number;
    const number = nextNumber(max);
    const team = await loadTeamMembers(c.tx, org, c.l.contract.id);
    const lead = await leadOf(c.l, c.today, c.tx);
    const active = await activeAmong(c.tx, org, [...team.map((m) => m.personId), ...lead.ids]);
    const routed = defaultAssignee(r.type, team, lead.ids, active);

    const row = await c.tx.workItem.create({
      data: {
        organisationId: org,
        contractId: c.l.contract.id,
        type: r.type,
        number,
        title: r.title,
        description: r.description,
        dueOn: r.dueOn === null ? null : dayToDate(r.dueOn),
        location: r.location,
        raisedBySupplierAccountId: actor.accountId,
        assigneePersonId: routed.assignee,
        sharedAt: c.now,
        severity: r.severity,
        happenedAt: r.happenedAt,
        recordedAt: c.now,
      },
      select: { id: true, type: true, number: true, title: true, description: true, dueOn: true, location: true, severity: true, happenedAt: true, sharedAt: true, assigneePersonId: true, assignedToContractor: true, raisedByPersonId: true, status: true, answer: true, inspectionResult: true },
    });
    const auditId = await audit(c, actor, row, "WorkItem", row.id, row.title, "CREATE", diffFields(null, { type: row.type, number: itemRef(row.type, number), title: row.title, description: row.description || null, priority: "NORMAL", dueOn: dayOrNull(row.dueOn), location: row.location || null, assigneePersonId: row.assigneePersonId, sharedAt: row.sharedAt?.toISOString() ?? null, severity: row.severity, happenedAt: row.happenedAt?.toISOString() ?? null }));
    if (i.stagedVersionIds.length > 0) await pinFiles(c, actor, row, i.stagedVersionIds);
    await tell(c, row, "WORK_ITEM_FROM_CONTRACTOR", auditId, routed.told);
    return { id: row.id, ref: itemRef(row.type, number) };
  });
}

// ------------------------------------------------------------------ reply

/// A reply on a shared item (B-2): always a Reply, never internal. Judged against the share's instant (PA056): a reply in the one second after a pushed `sharedAt` is refused
/// NOT_SHARED in words, never left to the trigger. Tells the staff raiser and assignee, or the lead when it has neither (B-17).
export function replyAsContractor(actor: SupplierActor, i: ReplyBody): Promise<{ id: string }> {
  return inWork(actor, i.contractId, async (c) => {
    gate(c);
    const row = await sharedItem(c, i.item);
    if (!contractorMayPost(row)) return refuse(portalMoveFaultText({ code: "ITEM_CLOSED" }));
    const faults = commentFaults(i.body);
    if (faults.length) refuse(faultsText(faults));
    // PA056: a Reply needs the share's instant at or before its own. A share is pushed up to a second past a file attached in the same second, so a reply in that second is
    // refused here, in words that ask for a moment (the staff words say "share it first"), and never left to the trigger.
    if (audienceFaults(row.sharedAt?.toISOString() ?? null, "REPLY", c.now).length) refuse("This is not ready for replies yet. Try again in a moment.");
    await throttle(c, actor, "REPLY");
    const written = await c.tx.workItemComment.create({ data: { organisationId: c.l.org.id, workItemId: row.id, body: i.body.trim(), internal: false, supplierAccountId: actor.accountId, recordedAt: c.now }, select: { id: true } });
    await audit(c, actor, row, "WorkItemComment", written.id, "comment", "CREATE", diffFields(null, { comment: i.body.trim(), audience: "Reply" }));
    await tell(c, row, "WORK_ITEM_FROM_CONTRACTOR", written.id);
    return { id: written.id };
  });
}

// ------------------------------------------------------------------ move

/**
 * Send for checking (as the assignee), Accept answer (as the raiser, Mark done) and Ask again (as the raiser, Send back with a reply): the move table's contractor rows
 * (`moveFaults`, `side: "CONTRACTOR"`), refused in words that name no one of the organisation. The status and `closedAt` change in one guarded UPDATE; Ask again writes its Reply in
 * the same act. Send for checking tells the staff raiser (the lead on a contractor-raised item); Ask again tells the staff assignee; Accept answer tells nobody.
 */
export function moveAsContractor(actor: SupplierActor, i: MoveBody): Promise<void> {
  return inWork(actor, i.contractId, async (c) => {
    gate(c);
    const row = await sharedItem(c, i.item);
    // WR-1: the line decides who may act on a linked item, so its branch comes before the item's who-holds-it checks; the stale-page check stays.
    if (row.defectItemId !== null) {
      if (defectActOf(i.action, "CONTRACTOR") !== "REPORT_RECTIFIED") return refuse(portalMoveFaultText({ code: "NOT_FOR_CONTRACTOR" }));
      if (row.status !== i.expectedFrom) return refuse(portalMoveFaultText({ code: "MOVED_ALREADY", by: null, at: "" }), 409);
      return markFixed(c, actor, row, i);
    }
    const target = TARGET[i.action];
    const faults = moveFaults(factsOf(row), CONTRACTOR_ACTOR, target, i.expectedFrom, { contractOpen: true, comment: i.comment });
    if (faults.length) return refuse(portalMoveFaultText(faults[0]), faults[0].code === "MOVED_ALREADY" ? 409 : 422);
    const action = actionOf(row.status, target);
    if (action !== i.action) return refuse(portalMoveFaultText({ code: "NOT_A_MOVE", from: row.status, to: target }));
    if (action === "SEND_BACK") {
      // Ask again writes a Reply, so it is judged as one (PA056), as the reply path is.
      if (audienceFaults(row.sharedAt?.toISOString() ?? null, "REPLY", c.now).length) return refuse("This is not ready for replies yet. Try again in a moment.");
      await throttle(c, actor, "REPLY");
    }

    const closed = action === "MARK_DONE";
    const done = await c.tx.workItem.updateMany({ where: { id: row.id, contractId: c.l.contract.id, organisationId: c.l.org.id, status: row.status }, data: { status: target, closedAt: closed ? c.now : null } });
    if (done.count !== 1) return refuse(portalMoveFaultText({ code: "MOVED_ALREADY", by: null, at: "" }), 409);
    // WSEC-9: accepting an answer accepts the text as it stands, and the trail records it.
    const accepted = answerAcceptedBy(action, factsOf(row));
    const auditId = await audit(c, actor, row, "WorkItem", row.id, row.title, "UPDATE", diffFields({ status: row.status, ...(accepted === null ? {} : { answerAccepted: null }) }, { status: target, ...(accepted === null ? {} : { answerAccepted: accepted }) }));
    if (action === "SEND_BACK") {
      const written = await c.tx.workItemComment.create({ data: { organisationId: c.l.org.id, workItemId: row.id, body: i.comment.trim(), internal: false, supplierAccountId: actor.accountId, recordedAt: c.now }, select: { id: true } });
      await audit(c, actor, row, "WorkItemComment", written.id, "comment", "CREATE", diffFields(null, { comment: i.comment.trim(), audience: "Reply" }));
    }
    if (action === "SEND_FOR_REVIEW") await tell(c, row, "WORK_ITEM_TO_CHECK", auditId);
    if (action === "SEND_BACK") await tell(c, row, "WORK_ITEM_RETURNED", auditId);
  });
}

/// The contractor reports a linked defect rectified: `rectifyWithin`'s rules and words (the portal's Defects tab asks the same core), refused here as this store refuses.
async function markFixed(c: WorkCtx, actor: SupplierActor, row: ItemRow, i: MoveBody): Promise<void> {
  try {
    const done = await rectifyWithin(c.tx, c.l, c.today ?? refuse("The day is not known. Tell the procurement office."), actor, { contractId: i.contractId, defectId: row.defectItemId!, note: "", evidenceDocumentId: null }, c.now);
    // WR-2: the work notice an ordinary "Send for checking" gives the raiser, keyed by the defect event, to nobody the defect notice already told.
    await tell(c, row, "WORK_ITEM_TO_CHECK", done.eventId, [], new Set(done.told));
  } catch (e) {
    // WR-1: the item is visible, so a line on a draft certificate is "not yet", never "not on this contract".
    if (e instanceof ProjectRefused && e.faults.some((f) => f.code === "DEFECT_ON_DRAFT_CPC")) return refuse(LINKED_DRAFT_PORTAL_WORDS);
    if (e instanceof ProjectRefused) return refuse(e.faults.map((f) => projectFaultText(f).en).join(" "), e.status === 404 ? 404 : e.status === 409 ? 409 : 422);
    throw e;
  }
}

// ------------------------------------------------------------------ answer

/// The Answer of an RFI assigned to the contractor, while it is open (WB-6, B-10): the one field the contractor edits. Tells nobody (the next move does).
export function answerAsContractor(actor: SupplierActor, i: AnswerBody): Promise<void> {
  return inWork(actor, i.contractId, async (c) => {
    gate(c);
    const row = await sharedItem(c, i.item);
    if (!contractorMayPost(row)) return refuse(portalMoveFaultText({ code: "ITEM_CLOSED" }));
    const edit = { field: "answer", value: i.answer } as const;
    const faults = fieldFaults(factsOf(row), CONTRACTOR_ACTOR, edit, { now: c.now, activeIds: new Set(), timeZone: c.l.org.timeZone, fromDocumentOnContract: true, who: { raiser: "", assignee: null, lead: null } });
    if (faults.length) refuse(faultsText(faults));
    if (row.answer === i.answer) return;
    await throttle(c, actor, "REPLY"); // an edit writes an audit row: it counts against the reply bound (WSEC-7)
    const done = await c.tx.workItem.updateMany({ where: { id: row.id, contractId: c.l.contract.id, organisationId: c.l.org.id, status: row.status }, data: { answer: i.answer } });
    if (done.count !== 1) refuse(portalMoveFaultText({ code: "MOVED_ALREADY", by: null, at: "" }), 409);
    await audit(c, actor, row, "WorkItem", row.id, row.title, "UPDATE", diffFields({ answer: row.answer || null }, { answer: i.answer || null }));
  });
}

