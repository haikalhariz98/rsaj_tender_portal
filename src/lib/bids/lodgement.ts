/**
 * `recordEstimateLodgement` (6.6 plan §4.6, flagged hook into accepted 6.2): the company estimate's
 * lodgement into the box, written on the register in the lodge act's own transaction, under its
 * exercise and estimate locks (requisition → exercise → estimate), then the envelope rows. It
 * never goes through a receipt: an estimate is lodged in preparation, before publication, so no
 * window fault is asked; only the closing (passed) and a cancelled exercise refuse
 * (`lodgementFaults`). The envelope carries the version's number, never its figure (ADR 0012).
 */

import type { Tx } from "@/lib/audit/record";
import { writeAudit } from "@/lib/audit/record";
import { diffFields } from "@/lib/audit/diff";

import { BID_ENTITY, envelopeFields } from "./audit-view";
import { judgeLodgement, lodgementFaults, lodgementMarkings } from "./estimate";
import { lockEnvelopeRows } from "./lock";
import type { LockedExercise } from "@/lib/scope/lock";

import type { Finding } from "./types";
import type { AuditActor } from "@/lib/auth/types";

export async function recordEstimateLodgement(
  tx: Tx,
  actor: AuditActor,
  l: LockedExercise,
  i: { personId: string; personName: string; versionNo: number; now: Date },
): Promise<{ ok: true; sequence: number } | { ok: false; faults: Finding[] }> {
  const faults = lodgementFaults({ status: l.ex.status, closing: l.ex.closingAt, now: i.now });
  if (faults.length) return { ok: false, faults };
  await lockEnvelopeRows(tx, l.ex.id);
  const last = await tx.bidEnvelope.findFirst({ where: { exerciseId: l.ex.id }, orderBy: { sequence: "desc" }, select: { sequence: true } });
  const sequence = (last?.sequence ?? 0) + 1;
  const judged = judgeLodgement(i.now, l.ex.closingAt);
  const markings = lodgementMarkings(i.versionNo);
  const row = await tx.bidEnvelope.create({
    data: {
      organisationId: l.org.id,
      exerciseId: l.ex.id,
      sequence,
      kind: "COMPANY_ESTIMATE",
      // Copy 1 goes into the tender box itself (6.2 FR-EST-010).
      channel: "BOX",
      receivedAt: judged.receivedAt,
      receivedSource: "SERVER",
      receivedByPersonId: i.personId,
      markings,
      late: judged.late,
      closingAtJudged: judged.closingAtJudged,
      recordedAfterClosing: judged.recordedAfterClosing,
    },
  });
  await writeAudit(tx, { actor, organisationId: l.org.id, entity: BID_ENTITY.envelope, entityId: row.id, entityLabel: `${l.ex.reference} · Envelope ${sequence}` }, "CREATE",
    diffFields(null, envelopeFields({ ...row, receivedBy: i.personName, parentSequence: null }, l.org.timeZone)));
  return { ok: true, sequence };
}
