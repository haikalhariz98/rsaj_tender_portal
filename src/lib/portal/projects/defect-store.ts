import { diffFields } from "@/lib/audit/diff";
import { writeAudit } from "@/lib/audit/record";
import type { SupplierActor } from "@/lib/auth/types";
import type { Tx } from "@/lib/audit/record";
import { defectActFaults, defectState, onDraftCpc } from "@/lib/closeout/defects";
import { defectFactsOf, loadCloseout } from "@/lib/closeout/load";
import { actStatusFault } from "@/lib/contract/act-status";
import { contractLabel, type LoadedContract } from "@/lib/contract/repo";
import type { ContractStatus } from "@/lib/contract/types";
import { toSecond } from "@/lib/bids/lateness";
import { dayToDate } from "@/lib/dates";
import { defectRectifiedNotices } from "@/lib/inbox/notices";
import { writeNotices } from "@/lib/inbox/store";
import { loadSupervision, soOfficeOn } from "@/lib/supervision/load";
import { stateAfter } from "@/lib/work/defect-link";
import { lockLinkedItem, writeThrough } from "@/lib/work/defect-link-store";

import { inHeldContract, supplierAuditActor } from "./submission-store";
import { ProjectRefused, type ProjectFinding } from "./types";

/**
 * The contractor marks a defect line rectified from its portal account (Phase 2 close-out stage B; plan closeout-plan.md §5; ADR 0047 D1). Words,
 * not a signature: no password is asked. One transaction under the contract's lock (`inHeldContract`: the session's supplier must hold the contract,
 * and another's line answers not found), the DEFECTS row of the act × status table asked, the line locked, its state read from its events
 * (`defectActFaults`: only an open line is reported), the evidence one of the contractor's own documents on this contract, then an event appended
 * with the supplier's account, audited with it, and the S.O. office's holders and acting holders told. An officer accepts it or returns it.
 */

const refuse = (fs: readonly ProjectFinding[], status: 404 | 409 | 422 = 422): never => {
  throw new ProjectRefused(fs, status);
};

/// `told`: the staff the defect notice went to, so a work notice for the same event leaves them out (once each, WR-2).
export type Reported = { eventId: string; told: string[] };
export type DefectReport = { contractId: string; defectId: string; note: string; evidenceDocumentId: string | null };

/**
 * The act inside a locked contract the supplier holds (the caller has taken the lock): the portal's own tab arrives through `reportRectifiedAsContractor`, and the work core of a
 * linked Defect item ("Mark as fixed", `work/portal-store.ts`) calls it with its own transaction. The linked item is locked before the line (contract, WorkItem, DefectItem), and its
 * status follows the event in the same transaction (B-18).
 */
export async function rectifyWithin(tx: Tx, l: LoadedContract, today: string, actor: SupplierActor, i: DefectReport, now: Date): Promise<Reported> {
  if (actStatusFault("DEFECTS", l.contract.status as ContractStatus)) return refuse([{ code: "CONTRACT_NOT_ACTIVE", level: "block" }]);
  const scope = { organisationId: actor.organisationId, contractId: l.contract.id, contractNumber: l.contract.number };
  const item = await lockLinkedItem(tx, scope, i.defectId);
  await tx.$queryRaw`SELECT id FROM "DefectItem" WHERE id = ${i.defectId} AND "contractId" = ${l.contract.id} FOR UPDATE`;
  const rows = await loadCloseout(l.contract.id, tx);
  const d = defectFactsOf(rows).find((x) => x.id === i.defectId);
  if (!d) return refuse([{ code: "DEFECT_NOT_FOUND", level: "block" }], 404);
  // F6: a line on a CPC not yet issued is not reported (the contractor's tab lists none until it issues).
  if (onDraftCpc(rows.lines.find((x) => x.id === d.id)!, rows.cpc?.certificate.status ?? null)) return refuse([{ code: "DEFECT_ON_DRAFT_CPC", level: "block" }], 404);
  if (defectActFaults("REPORT_RECTIFIED", defectState(d.events).state, { note: i.note, on: today, today }).length) return refuse([{ code: "DEFECT_NOT_OPEN", level: "block" }], 409);
  const evidence = i.evidenceDocumentId ? await tx.projectDocument.findFirst({ where: { id: i.evidenceDocumentId, contractId: l.contract.id, organisationId: actor.organisationId, side: "CONTRACTOR" }, select: { id: true, title: true } }) : null;
  if (i.evidenceDocumentId && !evidence) return refuse([{ code: "EVIDENCE_NOT_YOURS", level: "block" }]);
  const ev = await tx.defectEvent.create({ data: { organisationId: actor.organisationId, defectId: d.id, kind: "REPORTED_RECTIFIED", on: dayToDate(today), note: i.note.trim(), evidenceDocumentId: evidence?.id ?? null, supplierAccountId: actor.accountId, recordedAt: toSecond(now) } });
  const label = contractLabel({ number: l.contract.number, award: { awardeeName: l.award.awardeeName } });
  await writeAudit(tx, { actor: supplierAuditActor(actor), organisationId: actor.organisationId, entity: "DefectEvent", entityId: ev.id, entityLabel: `${label} · defect: ${d.description.slice(0, 80)}` }, "CREATE", diffFields(null, { defect: "reported rectified", on: today, note: i.note.trim() || null, evidence: evidence?.title ?? null, recordedBy: `${actor.displayName}, from the supplier's own portal account` }));
  if (item) await writeThrough(tx, supplierAuditActor(actor), scope, item, stateAfter("REPORT_RECTIFIED"), i.note, toSecond(now));
  const so = await soOfficeOn(l, await loadSupervision(l.contract.id, tx), today, tx);
  const drafts = defectRectifiedNotices({ eventId: ev.id, contractId: l.contract.id, contractLabel: label, contractorName: l.award.awardeeName, defect: d.description.slice(0, 120), recipients: [...(so?.office.holderIds ?? []), ...(so?.office.actingIds ?? [])] });
  await writeNotices(tx, actor.organisationId, null, drafts);
  return { eventId: ev.id, told: drafts.map((x) => x.recipientPersonId) };
}

export async function reportRectifiedAsContractor(actor: SupplierActor, i: DefectReport, now: Date = new Date()): Promise<Reported> {
  return inHeldContract(actor, i.contractId, (tx, l, today) => rectifyWithin(tx, l, today, actor, i, now), now);
}
