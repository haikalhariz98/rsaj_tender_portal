/**
 * What "attached" means (plan §3): a live attachment of the purpose on the owner — not
 * detached — whose pinned version is not withdrawn. This is the only place that counts;
 * no module counts attachment rows itself.
 *
 * A record that was judged on evidence snapshots the pins it was judged on (version id,
 * fingerprint, title), and later edits never rewrite the snapshot. `snapshotFaults` is
 * how a later act (an award's issue) learns that something it was judged on has since
 * been withdrawn.
 */

import type { AttachmentFact, AttachmentPurpose, Finding } from "./types";

export const isLive = (a: Pick<AttachmentFact, "detachedAt" | "version">) => a.detachedAt == null && a.version.withdrawnAt == null;

export function evidenceCount(attachments: readonly AttachmentFact[], purpose: AttachmentPurpose): number {
  return attachments.filter((a) => a.purpose === purpose && isLive(a)).length;
}

export interface EvidencePin {
  attachmentId: string;
  documentId: string;
  versionId: string;
  versionNo: number;
  sha256: string;
  title: string;
}

export function evidencePins(attachments: readonly AttachmentFact[], purpose: AttachmentPurpose): EvidencePin[] {
  return attachments
    .filter((a) => a.purpose === purpose && isLive(a))
    .map((a) => ({ attachmentId: a.id, documentId: a.version.documentId, versionId: a.version.id, versionNo: a.version.versionNo, sha256: a.version.sha256, title: a.version.title }));
}

/// The pins a judged record keeps. `takenOn` is the organisation's day it was judged.
export interface EvidenceSnapshot {
  v: 1;
  purposes: AttachmentPurpose[];
  takenOn: string;
  pins: (EvidencePin & { purpose: AttachmentPurpose })[];
}

export function evidenceSnapshot(attachments: readonly AttachmentFact[], purposes: readonly AttachmentPurpose[], takenOn: string): EvidenceSnapshot {
  return { v: 1, purposes: [...purposes], takenOn, pins: purposes.flatMap((p) => evidencePins(attachments, p).map((pin) => ({ ...pin, purpose: p }))) };
}

export function isEvidenceSnapshot(x: unknown): x is EvidenceSnapshot {
  if (!x || typeof x !== "object") return false;
  const s = x as Partial<EvidenceSnapshot>;
  return s.v === 1 && Array.isArray(s.pins) && Array.isArray(s.purposes) && s.pins.every((p) => !!p && typeof p.versionId === "string" && typeof p.sha256 === "string");
}

/// The counts for one exercise, as the method's rules read them.
export interface ExerciseEvidence {
  dossier: number;
  scope: number;
}

export const NO_EVIDENCE: ExerciseEvidence = { dossier: 0, scope: 0 };

export function exerciseEvidence(attachments: readonly AttachmentFact[]): ExerciseEvidence {
  return { dossier: evidenceCount(attachments, "DOSSIER_EVIDENCE"), scope: evidenceCount(attachments, "COORDINATION_SCOPE") };
}

export type SnapshotFault = "EVIDENCE_NOT_SNAPSHOTTED" | "EVIDENCE_WITHDRAWN_SINCE_JUDGED";

/**
 * Whether a judged record's evidence still stands. Where evidence is required and the
 * record has no snapshot — it was judged before attachments existed — it is refused, as
 * is any pinned version withdrawn since. Both name the way out (labels): cancel the
 * record and open it again, so the evidence is judged afresh.
 */
export function snapshotFaults(snapshot: unknown, withdrawnVersionIds: ReadonlySet<string>, required: boolean): Finding<SnapshotFault>[] {
  if (!required) return [];
  if (!isEvidenceSnapshot(snapshot)) return [{ code: "EVIDENCE_NOT_SNAPSHOTTED", level: "block" }];
  return snapshot.pins
    .filter((p) => withdrawnVersionIds.has(p.versionId))
    .map((p) => ({ code: "EVIDENCE_WITHDRAWN_SINCE_JUDGED" as const, level: "block" as const, data: { title: p.title, versionNo: p.versionNo } }));
}
