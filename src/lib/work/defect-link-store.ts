/**
 * The defect link's writes (workspace 3b-ii step 10; plan B-18), in the caller's transaction. Lock order for every act that touches a linked pair:
 * the contract, then the WorkItem row (`lockLinkedItem`), then the DefectItem row. The defect cores (`closeout/defect-acts.ts`, `portal/projects/defect-store.ts`) and the
 * CPC's list acts take it in that order; the work cores (`store.ts`) arrive already holding the item. Each write is audited on the item with its before and after.
 */

import { diffFields } from "@/lib/audit/diff";
import { writeAudit, type Tx } from "@/lib/audit/record";
import type { AuditActor } from "@/lib/auth/types";
import type { DefectState } from "@/lib/closeout/types";

import { dayOrNull, dayToDate } from "@/lib/dates";

import { linkedDueOn, linkedItemPatch } from "./defect-link";
import { workAuditPrefix } from "./load";
import { itemRef } from "./number";
import type { Day, WorkStatus } from "./types";

export interface LinkScope {
  organisationId: string;
  contractId: string;
  contractNumber: string;
}

export interface LinkedItem {
  id: string;
  type: "DEFECT";
  number: number;
  title: string;
  status: WorkStatus;
  cancelReason: string;
  dueOn: Date | null;
}

const SELECT = { id: true, type: true, number: true, title: true, status: true, cancelReason: true, dueOn: true } as const;

/// The item that stands for a line, locked (null: the line has none). Taken BEFORE the line's own lock. The link only changes under the contract's lock, so it is stable here.
export async function lockLinkedItem(tx: Tx, s: Pick<LinkScope, "organisationId" | "contractId">, defectId: string): Promise<LinkedItem | null> {
  const [hit] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "WorkItem" WHERE "defectItemId" = ${defectId} AND "contractId" = ${s.contractId} AND "organisationId" = ${s.organisationId} FOR UPDATE`;
  return hit ? ((await tx.workItem.findFirstOrThrow({ where: { id: hit.id, organisationId: s.organisationId }, select: SELECT })) as LinkedItem) : null;
}

const audit = (tx: Tx, actor: AuditActor, s: LinkScope, item: LinkedItem, changes: ReturnType<typeof diffFields>, reason = "") =>
  writeAudit(tx, { actor, organisationId: s.organisationId, entity: "WorkItem", entityId: item.id, entityLabel: workAuditPrefix(s.contractNumber, item.type, item.number) + item.title, reason }, "UPDATE", changes);

/// A defect act moved the line to `state`: the linked item's status follows in the same transaction (a withdrawal's note is its cancel reason).
export async function writeThrough(tx: Tx, actor: AuditActor, s: LinkScope, item: LinkedItem, state: DefectState, note: string, now: Date): Promise<void> {
  const patch = linkedItemPatch(state, note, now);
  const done = await tx.workItem.updateMany({ where: { id: item.id, organisationId: s.organisationId, contractId: s.contractId, status: item.status }, data: patch });
  if (done.count !== 1) throw new Error(`The item ${itemRef(item.type, item.number)} moved under its own lock.`);
  await audit(
    tx,
    actor,
    s,
    item,
    diffFields({ status: item.status, ...(patch.cancelReason === undefined ? {} : { cancelReason: item.cancelReason }) }, { status: patch.status, ...(patch.cancelReason === undefined ? {} : { cancelReason: patch.cancelReason }) }),
    patch.cancelReason ?? "",
  );
}

/// The item now stands for the line (the CPC list took it, or the one act created both): linked, and In progress, as an open line reads. Audited as the "Defect line" field.
export async function linkItem(tx: Tx, actor: AuditActor, s: LinkScope, item: LinkedItem, line: { id: string; description: string; dueOn: Day }, now: Date): Promise<void> {
  const patch = linkedItemPatch("OPEN", "", now);
  // WR-3: the item takes the line's due day (the fallback day where it had none); no Schedule of Defects can be issued while the CPC is a draft.
  const due = linkedDueOn(line.dueOn, null);
  const done = await tx.workItem.updateMany({ where: { id: item.id, organisationId: s.organisationId, contractId: s.contractId, status: item.status, defectItemId: null }, data: { ...patch, defectItemId: line.id, dueOn: dayToDate(due) } });
  if (done.count !== 1) throw new Error(`The item ${itemRef(item.type, item.number)} changed under its own lock.`);
  await audit(tx, actor, s, item, diffFields({ defectItemId: null, status: item.status, dueOn: dayOrNull(item.dueOn) }, { defectItemId: line.description.slice(0, 120), status: patch.status, dueOn: due }));
}

/// The line is taken off the list: the item stays a snag, with the status it has. It must be cleared before the line is deleted (the key restricts).
export async function unlinkItem(tx: Tx, actor: AuditActor, s: LinkScope, item: LinkedItem, line: { id: string; description: string }): Promise<void> {
  const done = await tx.workItem.updateMany({ where: { id: item.id, organisationId: s.organisationId, contractId: s.contractId, defectItemId: line.id }, data: { defectItemId: null } });
  if (done.count !== 1) throw new Error(`The item ${itemRef(item.type, item.number)} changed under its own lock.`);
  await audit(tx, actor, s, item, diffFields({ defectItemId: line.description.slice(0, 120) }, { defectItemId: null }));
}

/// A voided CPC takes its list with it: every picked item is unlinked (it stays a snag, offered again for the next CPC). Contract lock held; each item is locked in id order before any line.
export async function unlinkPickedBy(tx: Tx, actor: AuditActor, s: LinkScope, practicalCompletionId: string): Promise<void> {
  const lines = await tx.defectItem.findMany({ where: { practicalCompletionId, organisationId: s.organisationId, workItem: { isNot: null } }, select: { id: true, description: true, workItem: { select: { id: true } } } });
  for (const l of lines.sort((x, y) => (x.workItem!.id < y.workItem!.id ? -1 : 1))) {
    const item = await lockLinkedItem(tx, s, l.id);
    if (item) await unlinkItem(tx, actor, s, item, l);
  }
}

/// A Schedule of Defects is issuing: every contract item that stands for a line, locked in id order BEFORE any line (contract, WorkItem, DefectItem). Called ahead of the lines' own lock.
export async function lockLinkedItems(tx: Tx, s: Pick<LinkScope, "organisationId" | "contractId">): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "WorkItem" WHERE "contractId" = ${s.contractId} AND "organisationId" = ${s.organisationId} AND "defectItemId" IS NOT NULL ORDER BY id FOR UPDATE`;
}

/// WR-3: the Schedule of Defects issued with this rectify-by day; each OPEN line (the caller passes only those) takes it on its linked item, audited on the item, in the issue's transaction. A made-good line is not passed, so is untouched.
export async function writeScheduleDue(tx: Tx, actor: AuditActor, s: LinkScope, lines: readonly { id: string; dueOn: Day }[], rectifyBy: Day): Promise<void> {
  for (const l of lines) {
    const item = await lockLinkedItem(tx, s, l.id);
    if (!item) continue;
    const due = linkedDueOn(l.dueOn, rectifyBy);
    if (dayOrNull(item.dueOn) === due) continue;
    const done = await tx.workItem.updateMany({ where: { id: item.id, organisationId: s.organisationId, contractId: s.contractId }, data: { dueOn: dayToDate(due) } });
    if (done.count !== 1) throw new Error(`The item ${itemRef(item.type, item.number)} moved under its own lock.`);
    await audit(tx, actor, s, item, diffFields({ dueOn: dayOrNull(item.dueOn) }, { dueOn: due }), "Schedule of Defects issued");
  }
}
