/**
 * The reads behind `POST /api/opening/filed-file` (wave 3c plan §4.2, 20cl). Ids and one flag each: nothing sealed, no filename, no size, no figure. Scoped to the organisation and the exercise.
 * Nothing is written here; the filing is `ensureFileMoved`, and the download is logged by the document version route.
 */

import type { OnlineBidRules } from "@/lib/bids/online/types";
import { db } from "@/lib/db";

export interface FiledFileFacts {
  finalised: boolean;
  /// The file belongs to a submitted bid whose envelope was opened as an offer at THIS opening.
  fileOnOpening: boolean;
  /// The file's part is one the rules frozen at publication mark as opened at the opening (G1: never the live part configuration).
  checked: boolean;
}

/// Null: no such opening on this exercise.
export async function loadFiledFileFacts(i: { organisationId: string; exerciseId: string; openingId: string; fileId: string }): Promise<FiledFileFacts | null> {
  const opening = await db.opening.findFirst({ where: { id: i.openingId, exerciseId: i.exerciseId, organisationId: i.organisationId }, select: { finalisedAt: true, exercise: { select: { onlineBidRules: true } } } });
  if (!opening) return null;
  const file = await db.onlineBidFile.findFirst({ where: { id: i.fileId, exerciseId: i.exerciseId, organisationId: i.organisationId }, select: { packPartId: true, part: { select: { onlineBid: { select: { envelopeId: true } } } } } });
  const opened = file?.part ? (await db.openedBid.count({ where: { openingId: i.openingId, organisationId: i.organisationId, envelopeId: file.part.onlineBid.envelopeId } })) > 0 : false;
  const rules = (opening.exercise.onlineBidRules as OnlineBidRules | null)?.parts ?? [];
  return { finalised: opening.finalisedAt != null, fileOnOpening: opened, checked: !!file && rules.some((r) => r.packPartId === file.packPartId && r.openingCheck) };
}

/// The filed document that stands for a file: its version and the version's plain SHA-256. Null until the mover has filed it.
export async function filedVersionOf(organisationId: string, fileId: string): Promise<{ versionId: string; sha256: string } | null> {
  const f = await db.onlineBidFile.findFirst({ where: { id: fileId, organisationId }, select: { attachment: { select: { versionId: true, version: { select: { sha256: true } } } } } });
  return f?.attachment ? { versionId: f.attachment.versionId, sha256: f.attachment.version.sha256 } : null;
}
