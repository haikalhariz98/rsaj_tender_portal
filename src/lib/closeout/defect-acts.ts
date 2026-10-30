/**
 * The defect acts as transactional cores (workspace 3b-ii step 10; plan B-18; ADR 0047). `closeout-actions.ts` (the Close-out › Defects screen) and the work cores
 * (`work/store.ts`: a move on a linked item, a Defect item raised during the defects liability period) both call these INSIDE a locked contract, so a defect has one rule and
 * one home: the line. None takes the contract's lock; each asks the DEFECTS row of the act × status table itself, since the work path does not come through close-out's
 * `inContract`.
 *
 * Lock order: the contract, then the WorkItem row that stands for the line (`lockLinkedItem`), then the DefectItem row. A line's state is only ever its events (ADR 0047
 * D1); a linked item's status is written through in the same transaction as the event (`work/defect-link-store.ts`).
 */

import { diffFields } from "@/lib/audit/diff";
import { writeAudit } from "@/lib/audit/record";
import type { ActWriter } from "@/lib/auth/act-writer";
import { actStatusFault } from "@/lib/contract/act-status";
import type { ContractStatus } from "@/lib/contract/types";
import { storedDay } from "@/lib/dates";
import { ActRefusal, fieldError, recordedFor, tableRefusal, type ActCtx } from "@/lib/matter/act";
import { capacityText } from "@/lib/supervision/authority";
import { defectLineText, stateAfter } from "@/lib/work/defect-link";
import { linkItem, lockLinkedItem, tellLinkedWork, writeThrough } from "@/lib/work/defect-link-store";
import { isOpen } from "@/lib/work/move";
import { itemRefText } from "@/lib/work/labels";
import { itemRef } from "@/lib/work/number";

import { cpcLineFaults } from "./completion";
import { DEFECT_TEXT_MAX, defectActFaults, defectState, defectTextTooLong, onDraftCpc, reportDefectFaults, type DefectAct } from "./defects";
import { closeoutRefusal, waitingToBeCheckedWords } from "./labels";
import { defectFactsOf, loadCloseout } from "./load";

const EVENT_OF: Readonly<Record<DefectAct, "REPORTED_RECTIFIED" | "MADE_GOOD" | "RETURNED" | "WITHDRAWN">> = { REPORT_RECTIFIED: "REPORTED_RECTIFIED", ACCEPT: "MADE_GOOD", RETURN: "RETURNED", WITHDRAW: "WITHDRAWN" };
const EVENT_WORDS: Readonly<Record<DefectAct, string>> = { REPORT_RECTIFIED: "reported rectified", ACCEPT: "made good", RETURN: "returned: not made good", WITHDRAW: "withdrawn" };

/// The DEFECTS row of the act × status table, in its words.
function gate(c: ActCtx): void {
  const shut = actStatusFault("DEFECTS", c.l.contract.status as ContractStatus);
  if (shut) throw new ActRefusal(tableRefusal(shut));
}

const scope = (c: ActCtx) => ({ organisationId: c.l.org.id, contractId: c.l.contract.id, contractNumber: c.l.contract.number });

export interface DefectActInput {
  defectId: string;
  on: Date;
  note: string;
  evidenceDocumentId: string | null;
}

/// The event the act appended.
export interface DefectActDone {
  eventId: string;
  /// How many work notices the act wrote (the work path refreshes the inbox counts when there are some).
  workTold: number;
}

/// One act on a line, by an officer: an event appended, never the line changed. The officer must be the S.O. or a representative whose letter covers site observation.
export async function recordDefectAct(c: ActCtx, act: ActWriter, which: DefectAct, i: DefectActInput): Promise<DefectActDone> {
  gate(c);
  const who = await recordedFor(c, act, { act: "OBSERVATION" }, storedDay(i.on));
  const item = await lockLinkedItem(c.tx, scope(c), i.defectId); // the WorkItem, before the line
  await c.tx.$queryRaw`SELECT id FROM "DefectItem" WHERE id = ${i.defectId} AND "contractId" = ${c.l.contract.id} FOR UPDATE`;
  const rows = await loadCloseout(c.l.contract.id, c.tx);
  const d = defectFactsOf(rows).find((x) => x.id === i.defectId);
  if (!d) throw new ActRefusal({ ok: false, message: "That defect is not on this contract." });
  const fs = defectActFaults(which, defectState(d.events).state, { note: i.note, on: storedDay(i.on), today: c.today, onDraftCpc: onDraftCpc(rows.lines.find((x) => x.id === d.id)!, rows.cpc?.certificate.status ?? null) });
  if (fs.length) throw new ActRefusal({ ok: false, message: closeoutRefusal("Not recorded:", fs) });
  const evidence = i.evidenceDocumentId ? await c.tx.projectDocument.findFirst({ where: { id: i.evidenceDocumentId, contractId: c.l.contract.id, organisationId: c.l.org.id }, select: { id: true, title: true } }) : null;
  if (i.evidenceDocumentId && !evidence) fieldError("evidenceDocumentId", "That document is not on this contract.");
  const row = await c.tx.defectEvent.create({ data: { organisationId: c.l.org.id, defectId: d.id, kind: EVENT_OF[which], on: i.on, note: i.note.trim(), evidenceDocumentId: evidence?.id ?? null, personId: who.person.id, recordedAt: c.now } });
  await writeAudit(c.tx, { actor: c.actor, organisationId: c.l.org.id, entity: "DefectEvent", entityId: row.id, entityLabel: `${c.label} · defect: ${d.description.slice(0, 80)}`, reason: "" }, "CREATE", diffFields(null, { defect: EVENT_WORDS[which], on: storedDay(i.on), note: i.note.trim() || null, evidence: evidence?.title ?? null, recordedFor: `${who.person.name}, ${capacityText(who.capacity, who.soLabel)}` }));
  await act.write(c.tx, row.id, { roleCode: who.soRoleCode });
  let workTold = 0;
  if (item) {
    await writeThrough(c.tx, c.actor, scope(c), item, stateAfter(which), i.note, c.now);
    // WRS-4: whoever records it, the people working the linked item hear of the move once.
    if (which === "REPORT_RECTIFIED" || which === "RETURN") workTold = await tellLinkedWork(c.tx, c.l, c.today, item, { kind: which, eventId: row.id, actorIds: [who.person.id, ...(c.actor.kind === "STAFF" ? [c.actor.personId] : [])] });
  }
  return { eventId: row.id, workTold };
}

/// FR-CMP-007 with the work list (B-18): open Defect items the officer picked become lines on the draft CPC and are linked. The items are locked in ascending id order, each is
/// checked on the locked row (a Defect, open, not yet linked, of this contract), and a line is created, attributed and audited for each, with the item's status written through.
export async function addLinesFromItems(c: ActCtx, act: ActWriter, pc: { id: string; completionDate: Date; certificateStatus: string }, who: { personId: string; personName: string; roleCode: string }, itemIds: readonly string[], fallbackDue: Date | null): Promise<number> {
  const ids = [...new Set(itemIds)].sort();
  const s = scope(c);
  const sources = [];
  for (const id of ids) {
    await c.tx.$queryRaw`SELECT id FROM "WorkItem" WHERE id = ${id} AND "contractId" = ${c.l.contract.id} AND "organisationId" = ${c.l.org.id} FOR UPDATE`;
    const it = await c.tx.workItem.findFirst({ where: { id, contractId: c.l.contract.id, organisationId: c.l.org.id }, select: { id: true, type: true, number: true, title: true, description: true, location: true, dueOn: true, status: true, cancelReason: true, defectItemId: true, raisedByPersonId: true, assigneePersonId: true, assignedToContractor: true } });
    if (!it) throw new ActRefusal({ ok: false, message: "Not added: an item you picked no longer exists." });
    const ref = itemRefText(it.type, it.number);
    if (it.type !== "DEFECT") throw new ActRefusal({ ok: false, message: `Not added: ${ref} is not a Defect item.` });
    if (it.defectItemId !== null) throw new ActRefusal({ ok: false, message: `Not added: ${ref} is already on a defect list.` });
    if (!isOpen(it.status)) throw new ActRefusal({ ok: false, message: `Not added: ${ref} is closed.` });
    // WRS-2: an item the contractor reported fixed is not reset by a pick; the checker accepts it or sends it back first.
    if (it.status === "IN_REVIEW") throw new ActRefusal({ ok: false, message: waitingToBeCheckedWords(ref) });
    // WR-6: the line is never cut, so an item whose text is over the line's limit is refused, still unlinked and editable.
    if (defectTextTooLong(defectLineText(it.title, it.description))) throw new ActRefusal({ ok: false, message: `Not added: ${ref} is longer than ${DEFECT_TEXT_MAX.toLocaleString("en")} characters. Shorten it in Work first.` });
    sources.push({ ...it, type: "DEFECT" as const });
  }
  for (const it of sources) {
    const description = defectLineText(it.title, it.description);
    const dueOn = it.dueOn ?? fallbackDue;
    if (!dueOn) return fieldError("dueOn", `Give the day to make ${itemRefText(it.type, it.number)} good by.`);
    const fs = cpcLineFaults({ certificateStatus: pc.certificateStatus, description, dueOn: storedDay(dueOn), completionDate: storedDay(pc.completionDate) });
    if (fs.length) throw new ActRefusal({ ok: false, message: closeoutRefusal("Not added:", fs) });
    const row = await c.tx.defectItem.create({ data: { organisationId: c.l.org.id, contractId: c.l.contract.id, source: "PRACTICAL_COMPLETION", practicalCompletionId: pc.id, description, location: it.location.trim(), dueOn, reportedByPersonId: who.personId, recordedAt: c.now } });
    await writeAudit(c.tx, { actor: c.actor, organisationId: c.l.org.id, entity: "DefectItem", entityId: row.id, entityLabel: `${c.label} · defect`, reason: "" }, "CREATE", diffFields(null, { defect: description, where: it.location.trim() || null, madeGoodBy: storedDay(dueOn), onTheCertificate: "practical completion (draft)", fromWorkItem: itemRef(it.type, it.number), recordedFor: who.personName }));
    await act.write(c.tx, row.id, { roleCode: who.roleCode });
    await linkItem(c.tx, c.actor, s, it, { id: row.id, description, dueOn: storedDay(dueOn) }, c.now);
  }
  return sources.length;
}

export interface DefectLineRef {
  id: string;
  description: string;
}

export interface NewDefectLine {
  description: string;
  location: string;
  dueOn: Date | null;
  observedOn: Date | null;
  /// Set where the act's attribution was begun for another slot (the Defect item's `WorkItem.raisedBy`).
  alsoSlot?: "DefectItem.reportedBy";
}

/// A defect found during the defects liability period (FR-CMP-011): the line, under `reportDefectFaults` and the observer's capacity. Answers the line, so a Defect item raised
/// in the same act can stand for it (WB-12).
export async function reportDefectLine(c: ActCtx, act: ActWriter, i: NewDefectLine): Promise<DefectLineRef> {
  gate(c);
  const who = await recordedFor(c, act, { act: "OBSERVATION" }, c.today);
  const rows = await loadCloseout(c.l.contract.id, c.tx);
  const fs = reportDefectFaults({ cpcIssued: rows.cpc?.certificate.status === "ISSUED", dlpApplies: !!rows.cpc?.dlpStart, scheduleIssued: rows.schedule?.certificate.status === "ISSUED", description: i.description, dueOn: i.dueOn ? storedDay(i.dueOn) : null, observedOn: i.observedOn ? storedDay(i.observedOn) : null, completionDate: rows.cpc ? storedDay(rows.cpc.completionDate) : null, dlpEndExclusive: rows.cpc?.dlpEnd ? storedDay(rows.cpc.dlpEnd) : null, today: c.today });
  if (fs.length || !i.dueOn) throw new ActRefusal({ ok: false, message: closeoutRefusal("Not recorded:", fs) });
  const row = await c.tx.defectItem.create({ data: { organisationId: c.l.org.id, contractId: c.l.contract.id, source: "LIABILITY_PERIOD", description: i.description.trim(), location: i.location.trim(), dueOn: i.dueOn, observedOn: i.observedOn, reportedByPersonId: who.person.id, recordedAt: c.now } });
  await writeAudit(c.tx, { actor: c.actor, organisationId: c.l.org.id, entity: "DefectItem", entityId: row.id, entityLabel: `${c.label} · defect`, reason: "" }, "CREATE", diffFields(null, { defect: i.description.trim(), where: i.location.trim() || null, madeGoodBy: storedDay(i.dueOn), observedOn: i.observedOn ? storedDay(i.observedOn) : null, reported: "during the defects liability period", recordedFor: who.person.name }));
  // Raised on its own, the act was begun for this slot; raised with a Defect item, it was begun for the item's, and this slot is written beside it.
  if (i.alsoSlot) await act.writeAlso(c.tx, i.alsoSlot, row.id, { roleCode: who.soRoleCode });
  else await act.write(c.tx, row.id, { roleCode: who.soRoleCode });
  return { id: row.id, description: row.description };
}
