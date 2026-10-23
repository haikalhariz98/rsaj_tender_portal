/**
 * Acceptance on a complete return (FR-AWD-003, 008; OD-5; BD-12). One place decides it,
 * for both acts that can complete a return: recording what came back, and attaching the
 * last scan. Under the award's lock (the caller holds it): the return and the live scans
 * are read, `countedReturnComplete` judges them, and the award moves ISSUED → ACCEPTED
 * with the scan pins it was accepted on snapshotted, audited in the same transaction.
 */

import type { Prisma } from "@/generated/prisma/client";
import { diffFields } from "@/lib/audit/diff";
import { writeAudit, type Tx } from "@/lib/audit/record";
import { dayOrNull as day } from "@/lib/dates";
import { evidenceSnapshot, isLive } from "@/lib/documents/evidence";
import { attachmentFacts } from "@/lib/documents/repo";
import type { AttachmentFact } from "@/lib/documents/types";

import type { LoadedAward } from "./repo";
import { countedReturnComplete, RETURN_SCANS, scansMissing, type ReturnRecord, type ReturnScan } from "./stage-two";
import { awardTransition } from "./status";
import type { InstrumentKind } from "./types";
import type { AuditActor } from "@/lib/auth/types";

export function returnRecordOf(r: NonNullable<LoadedAward["award"]["awardReturn"]>): ReturnRecord {
  return {
    signedLetterReceivedOn: day(r.signedLetterReceivedOn),
    declarationReceivedOn: day(r.declarationReceivedOn),
    authorisationReceivedOn: day(r.authorisationReceivedOn),
    signatoryName: r.signatoryName,
    icNumber: r.icNumber,
    occupation: r.occupation,
    address: r.address,
    capacity: r.capacity,
    contractorSigned: r.contractorSigned,
    stampAffixed: r.stampAffixed,
    witnessName: r.witnessName,
    witnessSigned: r.witnessSigned,
  };
}

/// The award's return scans, read in the caller's transaction, and which purposes are live.
export async function returnScans(awardId: string, kind: InstrumentKind, client: Tx): Promise<{ attachments: AttachmentFact[]; attached: Set<ReturnScan> }> {
  const attachments = await attachmentFacts({ kind: "award", id: awardId }, client, RETURN_SCANS[kind]);
  return { attachments, attached: new Set(attachments.filter(isLive).map((a) => a.purpose as ReturnScan)) };
}

/**
 * Move an issued award to Accepted where its return is now complete with every scan.
 * Returns a line for the officer: accepted, or what is still to come; null where
 * nothing applies (not issued, or no return opened).
 */
export async function acceptOnCompleteReturn(tx: Tx, actor: AuditActor, l: LoadedAward, rec?: ReturnRecord): Promise<string | null> {
  const a = l.award;
  if (a.status !== "ISSUED" || !a.awardReturn || !l.org.today) return null;
  const kind = a.instrumentKind as InstrumentKind;
  const record = rec ?? returnRecordOf(a.awardReturn);
  const { attachments, attached } = await returnScans(a.id, kind, tx);
  if (!countedReturnComplete(kind, record, { required: true, attached })) {
    const missing = scansMissing(kind, record, attached);
    return missing.length ? "The return counts as complete once each item received has its scan attached." : null;
  }
  if (awardTransition("ISSUED", "ACCEPTED", { today: l.org.today, returnComplete: true })) return null;
  const snapshot = evidenceSnapshot(attachments, RETURN_SCANS[kind], l.org.today);
  const moved = await tx.award.updateMany({ where: { id: a.id, status: "ISSUED" }, data: { status: "ACCEPTED", returnScanSnapshot: snapshot as unknown as Prisma.InputJsonValue } });
  if (moved.count !== 1) return null;
  await writeAudit(
    tx,
    { actor, organisationId: l.org.id, entity: "Award", entityId: a.id, entityLabel: `${a.reference} · ${a.awardeeName}`, reason: kind === "LETTER_OF_ACCEPTANCE" ? "All three documents returned, each with its scan attached." : "The acceptance page is complete, with its scan attached." },
    "UPDATE",
    diffFields({ status: a.status }, { status: "ACCEPTED", scansAttached: snapshot.pins.length }),
  );
  return "The return is complete with its scans: the award is accepted.";
}
