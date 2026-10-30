/**
 * The defect link's writes (workspace 3b-ii step 10; plan B-18), in the caller's transaction. Lock order for every act that touches a linked pair:
 * the contract, then the WorkItem row (`lockLinkedItem`), then the DefectItem row. The defect cores (`closeout/defect-acts.ts`, `portal/projects/defect-store.ts`) and the
 * CPC's list acts take it in that order; the work cores (`store.ts`) arrive already holding the item. Each write is audited on the item with its before and after.
 */

import { diffFields } from "@/lib/audit/diff";
import { writeAudit, type Tx } from "@/lib/audit/record";
import type { AuditActor } from "@/lib/auth/types";
import type { DefectState } from "@/lib/closeout/types";

import { linkedItemPatch } from "./defect-link";
import { workAuditPrefix } from "./load";
import { itemRef } from "./number";
import type { WorkStatus } from "./types";

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
}

const SELECT = { id: true, type: true, number: true, title: true, status: true, cancelReason: true } as const;

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
export async function linkItem(tx: Tx, actor: AuditActor, s: LinkScope, item: LinkedItem, line: { id: string; description: string }, now: Date): Promise<void> {
  const patch = linkedItemPatch("OPEN", "", now);
  const done = await tx.workItem.updateMany({ where: { id: item.id, organisationId: s.organisationId, contractId: s.contractId, status: item.status, defectItemId: null }, data: { ...patch, defectItemId: line.id } });
  if (done.count !== 1) throw new Error(`The item ${itemRef(item.type, item.number)} changed under its own lock.`);
  await audit(tx, actor, s, item, diffFields({ defectItemId: null, status: item.status }, { defectItemId: line.description.slice(0, 120), status: patch.status }));
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
