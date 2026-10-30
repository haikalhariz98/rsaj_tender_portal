/**
 * Work items' acts, as transactional cores (workspace 3a step 3; plan §3.4, §5 "Rules for every step"; ADR 0048). Raise, edit a field, move, comment, link, unlink, attach files.
 *
 * Each core runs INSIDE a locked contract handed to it by its caller (`withLockedContract`, `src/app/projects/[id]/work-actions.ts`), so none takes the contract's lock.
 * Lock order: the contract, then the `WorkItem` row (`lockedItem`, naming the contract and the organisation, so a crafted id locks nothing of another's), then the store's
 * documents in id order. A link reads the second item and never locks it, so no two item rows are ever held together.
 *
 * Every core does the same seven things, in this order, in the caller's one transaction:
 *   1. the `WORK_ITEM` act × status row;  2. the W-3 permission on the locked rows;  3. the pure faults (`newItemFaults`, `fieldFaults`, `moveFaults`, `commentFaults`);
 *   4. the guarded write;  5. `writeAudit` with before and after;  6. `writeNotices`;  7. `act.write` for the act's slot (raising, commenting and linking have one).
 * A refusal throws `WorkRefused` before the first write, or rolls the transaction back after it, so nothing is left. Words are the pure rules' (`labels.ts`); no code reaches a screen.
 *
 * 3b-ii (B-18, WB-12): a Defect item may stand for a defect line (`defectItemId`). A move on such an item is a defect act (`closeout/defect-acts.ts`), refused in its words, and the
 * defect act writes the item's status through; a Defect item raised past practical completion is created WITH its line in the same act. Lock order: the contract, the WorkItem row,
 * then the line.
 *
 * Never changed by any core: an item's `type`, `contractId` or `number` (OQ-3; no trigger holds them), and `assigneeSupplierAccountId` (WS-9: never written).
 * A comment's audience is chosen when it is written and stored (`commentAudience`, ADR 0048 D4, 3b B-2). Sharing is one-way and audited (`sharedAt`, ADR 0049 D1): the
 * share core, an assignment to the contractor and a create with the toggle on write it; nothing clears it. Notices are keyed by the audit row's id (or the comment's), so a
 * retried act tells nobody twice.
 */

import type { Prisma } from "@/generated/prisma/client";
import { diffFields } from "@/lib/audit/diff";
import { recordDefectAct, reportDefectLine } from "@/lib/closeout/defect-acts";
import { COMPLETED_CONTRACT_STATUSES } from "@/lib/contract/case-stage";
import { actCtx, ActRefusal } from "@/lib/matter/act";
import { writeAudit, type Tx } from "@/lib/audit/record";
import type { PreparedAct } from "@/lib/auth/act-begin";
import { auditActorOfStaff } from "@/lib/auth/audit-actor";
import { actorDisplayName } from "@/lib/audit/actor";
import type { StaffActor } from "@/lib/auth/types";
import { actStatusFault, actStatusText } from "@/lib/contract/act-status";
import type { LoadedContract } from "@/lib/contract/repo";
import type { ContractStatus } from "@/lib/contract/types";
import { dayOrNull, dayToDate } from "@/lib/dates";
import { attachFault } from "@/lib/documents/attach";
import { attached, detached, filed } from "@/lib/documents/audit-view";
import { documentFaultText } from "@/lib/documents/labels";
import { lockDocument } from "@/lib/documents/lock";
import { workItemFacts, workItemLabel } from "@/lib/documents/owner-facts";
import { loadStorePolicy } from "@/lib/documents/service";
import { STAGED_FOR_WORK_ITEM } from "@/lib/documents/staged-for";
import { writeNotices } from "@/lib/inbox/store";
import { stagedFileFaults, type StagedFault, type StagedFile } from "@/lib/project-docs/bounds";
import { contractorMayDownload } from "@/lib/project-docs/visibility";

import { FILES_PER_ACT } from "./bounds";
import { defectActOf, defectLineText, linkedMoveWords } from "./defect-link";
import { commentFaults, fieldFaults, mayEdit, newItemFaults, type EditableField, type FieldEdit, type NewItem } from "./fields";
import { audienceFaults, commentAudience, removeFileFaults } from "./audience";
import { fieldFaultText, moveFaultText, removeFileWords, whoCanWords } from "./labels";
import { activeAmong, leadOf, whoNamesIn, workAuditPrefix } from "./load";
import { actionOf, answerAcceptedBy, isOpen, moveFaults, TARGET } from "./move";
import { itemRef, nextNumber } from "./number";
import { workNoticeDrafts, type NoticeItem } from "./notices";
import { CONTRACTOR_ASSIGNEE } from "./fields";
import { assigneeOf, person, raiserOf, sameParty } from "./party";
import { assigneePatch, sharedOnCreate, sharePatch, shareFaults } from "./sharing";
import type { Audience, Day, FieldFault, Party, WorkActor, WorkItemFacts, WorkNoticeKind, WorkStatus } from "./types";

// ------------------------------------------------------------------ context and refusals

/// The locked contract and the instant the act is read at: `now` once on entry, `today` the organisation's day of it (null when no time zone is set).
export interface WorkCtx {
  tx: Tx;
  l: LoadedContract;
  now: Date;
  today: Day | null;
  /// Counts the notices an act wrote, so the caller refreshes the inbox's counts only when there are some.
  told?: { count: number };
}

/// Raised inside an act's transaction, so that nothing is written. `status` is what a caller may answer with: 404 for what is not the actor's to see, 409 for a change that
/// came first, 422 for a rule. `words` is the refusal in words.
export class WorkRefused extends Error {
  constructor(
    readonly words: string,
    readonly status: 404 | 409 | 422 | 429 = 422,
  ) {
    super(words);
    this.name = "WorkRefused";
  }
}
const refuse = (words: string, status: 404 | 409 | 422 | 429 = 422): never => {
  throw new WorkRefused(words, status);
};
const faultsText = (fs: readonly FieldFault[]): string => [...new Set(fs.map(fieldFaultText))].join(" ");

/// Step 1 of every act: the contract's status, said in the act × status table's words.
function gate(c: WorkCtx): void {
  const shut = actStatusFault("WORK_ITEM", c.l.contract.status as ContractStatus);
  if (shut) refuse(actStatusText(shut));
}

/// A defect core's refusal (an `ActRefusal`, in close-out's words) as this store refuses: the same words, the same rollback.
async function viaDefectCore<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ActRefusal) return refuse(e.state.message ?? (Object.values(e.state.errors ?? {}).join(" ") || "Not recorded."));
    throw e;
  }
}
const defectCtx = (c: WorkCtx, who: StaffActor) => actCtx(c.tx, c.l, c.now, auditActorOfStaff(who)) ?? refuse("Time zone not set. Set it under Configuration › Organisation.");

const audit = (c: WorkCtx, who: StaffActor, row: Labelled, entity: string, entityId: string, what: string, action: "CREATE" | "UPDATE" | "DELETE", changes: ReturnType<typeof diffFields>, reason = "") =>
  writeAudit(c.tx, { actor: auditActorOfStaff(who), organisationId: c.l.org.id, entity, entityId, entityLabel: workAuditPrefix(c.l.contract.number, row.type, row.number) + what, reason }, action, changes);

interface Labelled {
  type: ItemRow["type"];
  number: number;
}

// ------------------------------------------------------------------ the item row, locked

const ITEM_SELECT = {
  id: true,
  type: true,
  number: true,
  title: true,
  description: true,
  status: true,
  priority: true,
  dueOn: true,
  location: true,
  raisedByPersonId: true,
  assigneePersonId: true,
  assignedToContractor: true,
  sharedAt: true,
  answer: true,
  impact: true,
  inspectionResult: true,
  severity: true,
  happenedAt: true,
  fromDocumentId: true,
  cancelReason: true,
  defectItemId: true,
} as const;
export type ItemRow = Prisma.WorkItemGetPayload<{ select: typeof ITEM_SELECT }>;

/// The WorkItem row, locked, then read: the one row lock of the workspace. Not found, or on another contract or organisation, reads as not found.
async function lockedItem(c: WorkCtx, itemId: string): Promise<ItemRow> {
  await c.tx.$queryRaw`SELECT id FROM "WorkItem" WHERE id = ${itemId} AND "contractId" = ${c.l.contract.id} AND "organisationId" = ${c.l.org.id} FOR UPDATE`;
  const row = await c.tx.workItem.findFirst({ where: { id: itemId, contractId: c.l.contract.id, organisationId: c.l.org.id }, select: ITEM_SELECT });
  return row ?? refuse("That item no longer exists.", 404);
}
// Not `export async function`: the lock-order scan reads every such export as a core (it must lock and judge), and this is the helper the cores lock with.
export { lockedItem };

/// Exported, with `lockedItem` below, for the contractor's cores (`portal-store.ts`, 3b step 4): one lock helper and one reading of a row, so the portal never restates either.
export const factsOf = (r: ItemRow): WorkItemFacts => ({ id: r.id, type: r.type, number: r.number, status: r.status, raisedBy: raiserOf(r), assignee: assigneeOf(r), sharedAt: r.sharedAt?.toISOString() ?? null, dueOn: dayOrNull(r.dueOn), answer: r.answer, inspectionResult: r.inspectionResult });

/// Who is acting, as the rules read them. Every active person of the organisation reads a contract's Work (see `load.ts`).
const actorOf = (who: StaffActor, lead: { ids: string[] }): WorkActor => ({ side: "STAFF", personId: who.personId, leadIds: lead.ids, mayReadContract: true });

/// The audit view of an item's columns: a day as its day, an instant as an ISO string (`renderValue` would cut a `Date` to its UTC day).
const columnView = (r: ItemRow, field: EditableField | "status" | "cancelReason"): unknown => (field === "dueOn" ? dayOrNull(r.dueOn) : field === "happenedAt" ? (r.happenedAt?.toISOString() ?? null) : r[field]);

/**
 * The instant a share is written at (B-3, WB-3). A file's audience is read from when it was attached: the portal lists it only if `attachedAt >= sharedAt`. The act's `now` is
 * cut to the second, as is `attachedAt` (`attachFiles` writes `c.now`), so a file attached earlier in the SAME second as the share would read as attached after it and leak.
 * The share is therefore pushed one second past the item's latest live file when that file is not strictly earlier: the safe side (a file attached in the share's own second
 * may read as before it and stay staff-only, to be attached again; none that was attached before is ever shown).
 */
async function shareInstant(c: WorkCtx, itemId: string): Promise<Date> {
  const latest = (await c.tx.documentAttachment.aggregate({ where: { organisationId: c.l.org.id, workItemId: itemId, detachedAt: null }, _max: { attachedAt: true } }))._max.attachedAt;
  return latest && latest.getTime() >= c.now.getTime() ? new Date(latest.getTime() + 1000) : c.now;
}

/// An assignee as the audit trail holds it, in the one Assignee line: a person's id, or the company's token (read as the awardee in Activity). Null: nobody.
const partyView = (p: Party | null): string | null => (p === null ? null : p.kind === "CONTRACTOR" ? CONTRACTOR_ASSIGNEE : p.id);

/// Step 6: the notices of an act, one kind to the people the pure rule names (never the actor, never someone inactive). The lead is told on every kind on an item the
/// contractor raised (WS-17); the contractor itself is never told (PW-13), so a contractor party names nobody.
async function tell(c: WorkCtx, who: StaffActor, r: Pick<ItemRow, "id" | "type" | "number" | "title" | "raisedByPersonId" | "assigneePersonId" | "assignedToContractor">, kind: WorkNoticeKind, occurrence: string, assigneeOverride?: Party | null): Promise<void> {
  const assignee = assigneeOverride === undefined ? assigneeOf(r) : assigneeOverride;
  const leadIds = r.raisedByPersonId === null ? (await leadOf(c.l, c.today, c.tx)).ids : [];
  const activeIds = await activeAmong(c.tx, c.l.org.id, [r.raisedByPersonId, assignee?.kind === "PERSON" ? assignee.id : null, who.personId, ...leadIds]);
  const item: NoticeItem = { id: r.id, type: r.type, number: r.number, title: r.title, contractId: c.l.contract.id, contractNumber: c.l.contract.number };
  const wrote = await writeNotices(c.tx, c.l.org.id, who.personId, workNoticeDrafts({ kind, actorId: who.personId, raisedBy: raiserOf(r), assignee, leadIds, occurrence, activeIds }, item));
  if (c.told) c.told.count += wrote;
}

// ------------------------------------------------------------------ raise an item

/// Raise an item (W-5: the next number of its type, under the contract's lock). Any staff member who may read the contract may raise one.
export async function createItem(c: WorkCtx, who: StaffActor, n: NewItem, act: PreparedAct): Promise<{ id: string; ref: string }> {
  gate(c);
  const org = c.l.org.id;
  const activeIds = await activeAmong(c.tx, org, [n.assigneePersonId, who.personId]);
  const fromOk = n.fromDocumentId === null || (await c.tx.projectDocument.findFirst({ where: { id: n.fromDocumentId, contractId: c.l.contract.id, organisationId: org }, select: { id: true } })) !== null;
  const faults = newItemFaults(n, { now: c.now, activeIds, timeZone: c.l.org.timeZone, fromDocumentOnContract: fromOk });
  if (faults.length) refuse(faultsText(faults));
  // WB-12: past practical completion a Defect is raised WITH its line in this one act, under `reportDefect`'s own checks and the observer's capacity; its refusals are that act's.
  const line =
    n.type === "DEFECT" && COMPLETED_CONTRACT_STATUSES.includes(c.l.contract.status as ContractStatus)
      ? await viaDefectCore(() => reportDefectLine(defectCtx(c, who), act, { description: defectLineText(n.title, n.description), location: n.location, dueOn: n.dueOn === null ? null : dayToDate(n.dueOn), observedOn: n.observedOn ? dayToDate(n.observedOn) : null, alsoSlot: "DefectItem.reportedBy" }))
      : null;

  const max = (await c.tx.workItem.aggregate({ where: { contractId: c.l.contract.id, organisationId: org, type: n.type }, _max: { number: true } }))._max.number;
  const number = nextNumber(max);
  const row = await c.tx.workItem.create({
    data: {
      organisationId: org,
      contractId: c.l.contract.id,
      type: n.type,
      number,
      title: n.title,
      description: n.description,
      priority: n.priority,
      dueOn: n.dueOn === null ? null : dayToDate(n.dueOn),
      location: n.location,
      raisedByPersonId: who.personId,
      assigneePersonId: n.assigneePersonId,
      // Assigning to the contractor shares in the same write (CHECK WorkItem_contractor_party_shared), and the audit row below says both.
      assignedToContractor: n.assignedToContractor,
      sharedAt: sharedOnCreate(n) ? c.now : null,
      answer: n.type === "RFI" ? n.answer : "",
      impact: n.impact,
      inspectionResult: n.inspectionResult,
      severity: n.severity,
      happenedAt: n.happenedAt,
      fromDocumentId: n.fromDocumentId,
      // An open line reads as In progress (`defectItemStatus`).
      ...(line ? { defectItemId: line.id, status: "IN_PROGRESS" as const } : {}),
      recordedAt: c.now,
    },
    select: ITEM_SELECT,
  });
  const auditId = await audit(c, who, row, "WorkItem", row.id, row.title, "CREATE", diffFields(null, { type: row.type, number: itemRef(row.type, number), title: row.title, description: row.description || null, priority: row.priority, dueOn: dayOrNull(row.dueOn), location: row.location || null, assigneePersonId: partyView(assigneeOf(row)), sharedAt: row.sharedAt?.toISOString() ?? null, answer: row.answer || null, impact: row.impact, inspectionResult: row.inspectionResult, severity: row.severity, happenedAt: row.happenedAt?.toISOString() ?? null, fromDocumentId: row.fromDocumentId, ...(line ? { defectItemId: line.description.slice(0, 120) } : {}) }));
  if (row.assigneePersonId) await tell(c, who, row, "WORK_ITEM_ASSIGNED", auditId);
  await act.write(c.tx, row.id);
  return { id: row.id, ref: itemRef(row.type, number) };
}

// ------------------------------------------------------------------ edit a field

/// The UPDATE of one field. An assignee change writes `assigneePatch`'s one UPDATE (one assignee form; the contractor's shares the item; step 3 audits `sharedAt`).
const columnData = (e: FieldEdit, r: ItemRow, now: Date): Prisma.WorkItemUncheckedUpdateManyInput =>
  e.field === "dueOn"
    ? { dueOn: e.value === null ? null : dayToDate(e.value) }
    : e.field === "assigneePersonId" || e.field === "assignedToContractor"
      ? assigneePatch(r.sharedAt?.toISOString() ?? null, e, now)
      : ({ [e.field]: e.value } as Prisma.WorkItemUncheckedUpdateManyInput);
const editedView = (e: FieldEdit): unknown => (e.field === "happenedAt" ? (e.value?.toISOString() ?? null) : e.value);

/// One field of an item (W-3: its raiser, its assignee or the lead; a closed item is read only until reopened). Setting an assignee tells them.
export async function editField(c: WorkCtx, who: StaffActor, i: { itemId: string; edit: FieldEdit }): Promise<void> {
  gate(c);
  const row = await lockedItem(c, i.itemId);
  const lead = await leadOf(c.l, c.today, c.tx);
  const activeIds = await activeAmong(c.tx, c.l.org.id, [i.edit.field === "assigneePersonId" ? i.edit.value : null, who.personId]);
  const fromOk = i.edit.field !== "fromDocumentId" || i.edit.value === null || (await c.tx.projectDocument.findFirst({ where: { id: i.edit.value, contractId: c.l.contract.id, organisationId: c.l.org.id }, select: { id: true } })) !== null;
  const faults = fieldFaults(factsOf(row), actorOf(who, lead), i.edit, { now: c.now, activeIds, timeZone: c.l.org.timeZone, fromDocumentOnContract: fromOk, who: await whoNamesIn(c, row, lead) });
  if (faults.length) refuse(faultsText(faults));

  // An assignee change is ONE logical line whichever way it goes (person to the company and back, B-7): the Assignee field, compared as parties, never two columns.
  const data = columnData(i.edit, row, i.edit.field === "assignedToContractor" && row.sharedAt === null ? await shareInstant(c, row.id) : c.now);
  const toParty: Party | null | undefined = i.edit.field === "assigneePersonId" ? (i.edit.value === null ? null : person(i.edit.value)) : i.edit.field === "assignedToContractor" ? { kind: "CONTRACTOR" } : undefined;
  if (toParty !== undefined && sameParty(assigneeOf(row), toParty)) return; // nothing moved: no write, no audit row
  const changes =
    toParty === undefined
      ? diffFields({ [i.edit.field]: columnView(row, i.edit.field) }, { [i.edit.field]: editedView(i.edit) })
      : [...diffFields({ assigneePersonId: partyView(assigneeOf(row)) }, { assigneePersonId: partyView(toParty) }), ...(data.sharedAt instanceof Date ? diffFields({ sharedAt: null }, { sharedAt: data.sharedAt.toISOString() }) : [])];
  if (changes.length === 0) return;
  const done = await c.tx.workItem.updateMany({ where: { id: row.id, contractId: c.l.contract.id, organisationId: c.l.org.id, status: row.status }, data });
  if (done.count !== 1) refuse("Someone changed this a moment ago.", 409);
  const auditId = await audit(c, who, row, "WorkItem", row.id, row.title, "UPDATE", changes);
  if (i.edit.field === "assigneePersonId" && i.edit.value !== null) await tell(c, who, row, "WORK_ITEM_ASSIGNED", auditId, person(i.edit.value));
}

// ------------------------------------------------------------------ share an item

/**
 * Share an item with the contractor (B-1, WB-2; ADR 0049 D1): `sharedAt` is the instant, audited as `sharedAt: none -> instant`, and nothing clears it. The screen asks the
 * "This can't be undone" confirm first; the store takes no confirmation from the client, since the rule is that the act is one-way, not that it was asked. W-3 on an open
 * item (the raiser, the assignee or the lead). Sharing a shared item is a no-op (no new instant, no audit row); a request to unshare is SHARE_IS_ONE_WAY. The contractor is told
 * nothing (PW-13): it finds the item on its list.
 */
export async function shareItem(c: WorkCtx, who: StaffActor, i: { itemId: string; share: boolean }): Promise<void> {
  gate(c);
  const row = await lockedItem(c, i.itemId);
  const lead = await leadOf(c.l, c.today, c.tx);
  const faults = shareFaults(factsOf(row), actorOf(who, lead), i.share, await whoNamesIn(c, row, lead));
  if (faults.length) refuse(faultsText(faults));
  const patch = i.share && row.sharedAt === null ? sharePatch(null, await shareInstant(c, row.id)) : null;
  if (!patch) return; // already shared, or "not shared" asked of an unshared item: nothing to write
  const done = await c.tx.workItem.updateMany({ where: { id: row.id, contractId: c.l.contract.id, organisationId: c.l.org.id, sharedAt: null }, data: patch });
  if (done.count !== 1) refuse("Someone changed this a moment ago.", 409);
  await audit(c, who, row, "WorkItem", row.id, row.title, "UPDATE", diffFields({ sharedAt: null }, { sharedAt: patch.sharedAt.toISOString() }));
}

// ------------------------------------------------------------------ move an item

/// Who last moved the row (its status), from the audit trail, for MOVED_ALREADY's words. A later edit of a title is not a move.
async function lastMove(c: WorkCtx, itemId: string): Promise<{ by: string | null; at: string }> {
  const rows = await c.tx.auditEntry.findMany({ where: { organisationId: c.l.org.id, entity: "WorkItem", entityId: itemId, action: "UPDATE" }, orderBy: [{ at: "desc" }, { id: "desc" }], take: 20, include: { actorPerson: { select: { name: true } } } });
  const e = rows.find((r) => (r.changes as unknown as { field: string }[]).some((x) => x.field === "status")) ?? rows[0];
  return { by: e ? actorDisplayName(e) : null, at: e?.at.toISOString() ?? "" };
}

/// A move on a linked item: the item's own who-may and shape rules do not apply, the defect act decides them. Mark done is `acceptDefect`, Send back is `returnDefect` (the comment is its
/// note), Cancel is `withdrawDefect` (the reason is its note), Send for checking is `reportDefectRectified`; Reopen and Start have no act. The item's status is written by the act.
async function linkedMove(c: WorkCtx, who: StaffActor, row: ItemRow, i: { expectedFrom: WorkStatus; to: WorkStatus; reason?: string; comment?: string; viaDefectAct?: boolean }, act: PreparedAct | null): Promise<void> {
  // The page and the row disagree about the link: the attribution begun for this act is not the defect event's.
  const stale = () => refuse("This defect was linked or unlinked a moment ago. Reload and try again.", 409);
  if (row.defectItemId === null) return stale();
  if (row.status !== i.expectedFrom) return refuse("Someone changed this a moment ago.", 409);
  const action = actionOf(row.status, i.to);
  const which = defectActOf(action, "STAFF");
  if (!which) return refuse(linkedMoveWords(action));
  if (!i.viaDefectAct || !act) return stale();
  const ctx = defectCtx(c, who);
  const note = which === "RETURN" ? (i.comment ?? "") : which === "WITHDRAW" ? (i.reason ?? "") : "";
  await viaDefectCore(() => recordDefectAct(ctx, act, which, { defectId: row.defectItemId!, on: dayToDate(ctx.today), note, evidenceDocumentId: null }));
}

/**
 * A status change (§3.3's table, the pure `moveFaults`): the act carries the status the reader saw (`expectedFrom`), and a row that is no longer there is MOVED_ALREADY,
 * naming who moved it. The status and `closedAt` change in one UPDATE (the table's CHECK), and Cancel writes its reason in that write. Send back writes its comment in the
 * same act (`act` is then the comment's attribution; the other moves have none). Review tells the raiser; send back tells the assignee.
 */
export async function moveItem(c: WorkCtx, who: StaffActor, i: { itemId: string; expectedFrom: WorkStatus; to: WorkStatus; reason?: string; comment?: string; viaDefectAct?: boolean }, act: PreparedAct | null): Promise<void> {
  gate(c);
  const row = await lockedItem(c, i.itemId);
  // B-18: an item that stands for a defect line moves only through the defect acts (and the edge begins their attribution, not a comment's, for it).
  if (row.defectItemId !== null || i.viaDefectAct) return linkedMove(c, who, row, i, act);
  const shut = actStatusFault("WORK_ITEM", c.l.contract.status as ContractStatus);
  const lead = await leadOf(c.l, c.today, c.tx);
  const names = await whoNamesIn(c, row, lead);
  const action = actionOf(row.status, i.to);
  const faults = moveFaults(factsOf(row), actorOf(who, lead), i.to, i.expectedFrom, { contractOpen: shut === null, reason: i.reason, comment: i.comment, lastMove: row.status === i.expectedFrom ? null : await lastMove(c, row.id) });
  if (faults.length) refuse(moveFaultText(faults[0], action, names), faults[0].code === "MOVED_ALREADY" ? 409 : 422);
  if (!action) throw new Error("A move the table allows has an action.");

  const closed = TARGET[action] === "DONE" || TARGET[action] === "CANCELLED";
  const cancelReason = action === "CANCEL" ? i.reason!.trim() : undefined;
  const done = await c.tx.workItem.updateMany({
    where: { id: row.id, contractId: c.l.contract.id, organisationId: c.l.org.id, status: row.status },
    data: { status: i.to, closedAt: closed ? c.now : null, ...(cancelReason === undefined ? {} : { cancelReason }) },
  });
  if (done.count !== 1) refuse("Someone changed this a moment ago.", 409);
  // WSEC-9: closing an RFI accepts the answer as it stands (it may be the contractor's draft); the trail records the text it accepted.
  const accepted = answerAcceptedBy(action, factsOf(row));
  const auditId = await audit(
    c,
    who,
    row,
    "WorkItem",
    row.id,
    row.title,
    "UPDATE",
    diffFields({ status: row.status, ...(cancelReason === undefined ? {} : { cancelReason: row.cancelReason }), ...(accepted === null ? {} : { answerAccepted: null }) }, { status: i.to, ...(cancelReason === undefined ? {} : { cancelReason }), ...(accepted === null ? {} : { answerAccepted: accepted }) }),
    cancelReason ?? "",
  );

  if (action === "SEND_BACK") {
    if (!act) throw new Error("Sending back writes a comment, which needs its attribution (beginAct).");
    // B-2: on an item the contractor holds, the comment is a Reply (it must see why the item came back); on any other it stays internal.
    const audience = commentAudience(factsOf(row), "STAFF", null, "SEND_BACK");
    const unshared = audienceFaults(factsOf(row).sharedAt, audience, c.now);
    if (unshared.length) refuse(faultsText(unshared));
    const written = await c.tx.workItemComment.create({ data: { organisationId: c.l.org.id, workItemId: row.id, body: i.comment!.trim(), internal: audience === "INTERNAL", personId: who.personId, recordedAt: c.now }, select: { id: true } });
    await audit(c, who, row, "WorkItemComment", written.id, "comment", "CREATE", diffFields(null, { comment: i.comment!.trim(), audience: AUDIENCE_WORDS[audience] }));
    await act.write(c.tx, written.id);
  }
  if (action === "SEND_FOR_REVIEW") await tell(c, who, row, "WORK_ITEM_TO_CHECK", auditId);
  if (action === "SEND_BACK") await tell(c, who, row, "WORK_ITEM_RETURNED", auditId);
}

// ------------------------------------------------------------------ comment

/// WSEC-1: the share state the page saw against the locked row. Sharing is one-way, so the only difference there can be is "shared a moment ago".
function staleShare(row: Pick<ItemRow, "sharedAt">, expectedShared: boolean): void {
  if ((row.sharedAt !== null) !== expectedShared) refuse("This item was shared a moment ago. Check before sending.", 409);
}

/// How an audience reads in the audit row of a comment.
const AUDIENCE_WORDS: Readonly<Record<Audience, string>> = { REPLY: "Reply", INTERNAL: "Internal note" };

/// A comment (any staff member who may read the contract). Its audience is chosen now and stored (B-2): on an unshared item it is internal, and a Reply asked for there is
/// refused (never quietly kept internal); on a shared item the composer's choice, and Internal when none is made (WSEC-1). `expectedShared` is the share state the page was drawn
/// with: a row that differs (shared a moment ago) is refused 409, so a note written as internal can never go out as a Reply. The raiser and the assignee, but for the writer, are told once each.
export async function comment(c: WorkCtx, who: StaffActor, i: { itemId: string; body: string; audience: Audience | null; expectedShared: boolean }, act: PreparedAct): Promise<{ id: string }> {
  gate(c);
  const row = await lockedItem(c, i.itemId);
  staleShare(row, i.expectedShared);
  const sharedAt = row.sharedAt?.toISOString() ?? null;
  const audience = commentAudience(factsOf(row), "STAFF", i.audience, "COMMENT");
  // The choice is judged as asked (a Reply on an unshared item is refused, not kept internal), and the audience it becomes is judged against the share's instant (PA056).
  const faults = [...commentFaults(i.body), ...(i.audience === null ? [] : audienceFaults(sharedAt, i.audience, c.now)), ...audienceFaults(sharedAt, audience, c.now)];
  if (faults.length) refuse(faultsText(faults));
  const written = await c.tx.workItemComment.create({ data: { organisationId: c.l.org.id, workItemId: row.id, body: i.body.trim(), internal: audience === "INTERNAL", personId: who.personId, recordedAt: c.now }, select: { id: true } });
  await audit(c, who, row, "WorkItemComment", written.id, "comment", "CREATE", diffFields(null, { comment: i.body.trim(), audience: AUDIENCE_WORDS[audience] }));
  await tell(c, who, row, "WORK_ITEM_COMMENT", written.id);
  await act.write(c.tx, written.id);
  return { id: written.id };
}

// ------------------------------------------------------------------ links

/// W-3 for a link: the raiser, the assignee or the lead, on an item that is not closed.
async function mayLink(c: WorkCtx, who: StaffActor, row: ItemRow): Promise<void> {
  if (!isOpen(row.status)) return refuse(fieldFaultText({ code: "CLOSED_ITEM" }));
  const lead = await leadOf(c.l, c.today, c.tx);
  if (!mayEdit({ raisedBy: raiserOf(row), assignee: assigneeOf(row) }, actorOf(who, lead))) refuse(whoCanWords("EDIT", await whoNamesIn(c, row, lead)).en);
}

/// Link the item to another item or to a project document of the same contract. The panel reads links both ways, so B to A is refused where A to B exists.
export async function link(c: WorkCtx, who: StaffActor, i: { itemId: string; toItemId: string | null; documentId: string | null }, act: PreparedAct): Promise<{ id: string }> {
  gate(c);
  const row = await lockedItem(c, i.itemId);
  await mayLink(c, who, row);
  if ((i.toItemId === null) === (i.documentId === null)) return refuse("Pick one item or one document to link.");
  const org = c.l.org.id;
  let target: { toWorkItemId: string | null; projectDocumentId: string | null; label: string; other?: Labelled };
  if (i.toItemId !== null) {
    if (i.toItemId === row.id) return refuse("An item can't link to itself.");
    // Read, never locked: no two item rows are held together.
    const other = await c.tx.workItem.findFirst({ where: { id: i.toItemId, organisationId: org }, select: { id: true, contractId: true, type: true, number: true, title: true } });
    if (!other) return refuse("That item no longer exists.", 404);
    if (other.contractId !== c.l.contract.id) return refuse(fieldFaultText({ code: "OTHER_CONTRACT" }));
    const there = await c.tx.workItemLink.findFirst({ where: { organisationId: org, OR: [{ workItemId: row.id, toWorkItemId: other.id }, { workItemId: other.id, toWorkItemId: row.id }] }, select: { id: true } });
    if (there) return refuse("Already linked.", 409);
    target = { toWorkItemId: other.id, projectDocumentId: null, label: `${itemRef(other.type, other.number)} · ${other.title}`, other };
  } else {
    const doc = await c.tx.projectDocument.findFirst({ where: { id: i.documentId!, organisationId: org }, select: { id: true, contractId: true, title: true } });
    if (!doc) return refuse("That document no longer exists.", 404);
    if (doc.contractId !== c.l.contract.id) return refuse(fieldFaultText({ code: "OTHER_CONTRACT" }));
    if (await c.tx.workItemLink.findFirst({ where: { workItemId: row.id, projectDocumentId: doc.id }, select: { id: true } })) return refuse("Already linked.", 409);
    target = { toWorkItemId: null, projectDocumentId: doc.id, label: doc.title };
  }
  const made = await c.tx.workItemLink.create({ data: { organisationId: org, workItemId: row.id, toWorkItemId: target.toWorkItemId, projectDocumentId: target.projectDocumentId, personId: who.personId, recordedAt: c.now }, select: { id: true } });
  await audit(c, who, row, "WorkItemLink", made.id, "link", "CREATE", diffFields(null, { linkedTo: target.label }));
  // The other end's Activity shows the link too: the same link, audited under that item, naming this one.
  if (target.other) await audit(c, who, target.other, "WorkItemLink", made.id, "link", "CREATE", diffFields(null, { linkedTo: `${itemRef(row.type, row.number)} · ${row.title}` }));
  await act.write(c.tx, made.id);
  return { id: made.id };
}

/// Remove a link from either end (the row is one link). A delete, and the delete is audited with what it linked.
export async function unlink(c: WorkCtx, who: StaffActor, i: { itemId: string; linkId: string }): Promise<void> {
  gate(c);
  const row = await lockedItem(c, i.itemId);
  await mayLink(c, who, row);
  const found = await c.tx.workItemLink.findFirst({
    where: { id: i.linkId, organisationId: c.l.org.id, OR: [{ workItemId: row.id }, { toWorkItemId: row.id }] },
    select: { id: true, workItemId: true, toWorkItem: { select: { type: true, number: true, title: true } }, workItem: { select: { type: true, number: true, title: true } }, projectDocument: { select: { title: true } } },
  });
  if (!found) return refuse("That link no longer exists.", 404);
  const ends = found.workItemId === row.id ? (found.toWorkItem ?? null) : found.workItem;
  const label = ends ? `${itemRef(ends.type, ends.number)} · ${ends.title}` : (found.projectDocument?.title ?? "a document");
  const removed = await c.tx.workItemLink.deleteMany({ where: { id: found.id, organisationId: c.l.org.id } });
  if (removed.count !== 1) refuse("That link no longer exists.", 404);
  await audit(c, who, row, "WorkItemLink", found.id, "link", "DELETE", diffFields({ linkedTo: label }, { linkedTo: null }));
  if (ends) await audit(c, who, ends, "WorkItemLink", found.id, "link", "DELETE", diffFields({ linkedTo: `${itemRef(row.type, row.number)} · ${row.title}` }, { linkedTo: null }));
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
 * Pin staged files to an item (W-8): any staff member who may read the contract. A file is staged first, outside any lock, through the staff upload route
 * (`stagedFor=work-item`); here it is pinned under the contract's lock and the item's, then the store's documents in id order (a concurrent withdrawal is seen and a file is
 * never pinned twice). The class for project files must be set: while it is not, attaching is refused by name. Only the actor's own staged files are looked up, so an
 * id of anyone else's reads as unknown and the faults are no oracle on the store.
 */
export async function attachFiles(c: WorkCtx, who: StaffActor, i: { itemId: string; stagedVersionIds: readonly string[]; expectedShared: boolean }): Promise<{ count: number }> {
  gate(c);
  const row = await lockedItem(c, i.itemId);
  staleShare(row, i.expectedShared); // WSEC-1: a file attached from a page that saw the item unshared must not reach the contractor
  const ids = i.stagedVersionIds;
  if (ids.length === 0) return refuse("Choose a file first.");
  if (ids.length > FILES_PER_ACT) return refuse(`Attach at most ${FILES_PER_ACT} files at a time.`);
  const policy = await loadStorePolicy(c.l.org.id, c.tx);
  if (policy.projectDocumentClassId === null) return refuse(documentFaultText({ code: "PROJECT_CLASS_NOT_SET", level: "block" }));

  const own = { id: { in: [...ids] }, organisationId: c.l.org.id, recordedByPersonId: who.personId, recordedBySupplierAccountId: null, document: { stagedFor: STAGED_FOR_WORK_ITEM } };
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
    // Item files may later reach the contractor (3b), so a SULIT or unclassified file is refused now.
    if (!contractorMayDownload({ versionVisible: true, documentClassification: r.document.classificationSnapshot, classClassification: r.document.documentClass.classification })) words.push(`File ${n + 1}: it is not classed for sharing with the contractor.`);
  });
  for (const f of stagedFileFaults(known, { side: "ORGANISATION", personId: who.personId, authorityToday: true }, policy.projectDocumentClassId, STAGED_FOR_WORK_ITEM)) words.push(`File ${Number(f.data?.file ?? 0)}: ${STAGED_WORDS[f.code]}`);
  if (words.length) refuse([...new Set(words)].join(" "));

  const label = workItemLabel(facts);
  for (const id of ids) {
    const r = byId.get(id)!;
    const pinned = await c.tx.documentAttachment.create({ data: { organisationId: c.l.org.id, purpose: "WORK_ITEM_FILE", versionId: r.id, workItemId: row.id, attachedAt: c.now }, select: { id: true } });
    await audit(c, who, row, "DocumentAttachment", pinned.id, r.originalFilename, "CREATE", attached({ purpose: "WORK_ITEM_FILE", title: r.document.title, versionNo: r.versionNo, sha256: r.sha256, owner: label }));
    if (r.document.status === "STAGED") {
      await c.tx.document.update({ where: { id: r.document.id, organisationId: c.l.org.id }, data: { status: "FILED", filedAt: c.now } });
      await writeAudit(c.tx, { actor: auditActorOfStaff(who), organisationId: c.l.org.id, entity: "Document", entityId: r.document.id, entityLabel: `Document · ${r.document.title}` }, "UPDATE", filed());
    }
  }
  return { count: ids.length };
}

/**
 * Remove a file from an item (B-6, WB-4): a detach with a reason, audited, on an UNSHARED open item only; on a shared one a file is never removed (the contractor may hold
 * it; a correction is a new file and a reply). Only the staff member who attached it, or the lead. The attacher is the version's recorder: `attachFiles` pins only the
 * actor's own staged versions, so the two are the same person by construction. A detached pin holds nothing, so the store may then withdraw the version (PA047).
 */
export async function removeFile(c: WorkCtx, who: StaffActor, i: { itemId: string; attachmentId: string; reason: string }): Promise<void> {
  gate(c);
  const row = await lockedItem(c, i.itemId);
  const pin = await c.tx.documentAttachment.findFirst({
    where: { id: i.attachmentId, organisationId: c.l.org.id, workItemId: row.id, purpose: "WORK_ITEM_FILE", detachedAt: null },
    select: { id: true, version: { select: { versionNo: true, originalFilename: true, recordedByPersonId: true, document: { select: { title: true } } } } },
  });
  if (!pin) return refuse("That file no longer exists.", 404);
  const lead = await leadOf(c.l, c.today, c.tx);
  const attacher = pin.version.recordedByPersonId;
  const named = await whoNamesIn(c, { raisedByPersonId: attacher, assigneePersonId: null }, lead);
  const faults = removeFileFaults(factsOf(row), actorOf(who, lead), attacher, i.reason, removeFileWords(attacher ? named.raiser : null, named.lead));
  if (faults.length) refuse(faultsText(faults));
  const reason = i.reason.trim();
  const done = await c.tx.documentAttachment.updateMany({ where: { id: pin.id, organisationId: c.l.org.id, workItemId: row.id, detachedAt: null }, data: { detachedAt: c.now, detachReason: reason } });
  if (done.count !== 1) refuse("That file no longer exists.", 404);
  await audit(c, who, row, "DocumentAttachment", pin.id, pin.version.originalFilename, "UPDATE", detached({ purpose: "WORK_ITEM_FILE", title: pin.version.document.title, versionNo: pin.version.versionNo, reason }), reason);
}
