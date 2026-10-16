/**
 * The reads behind the officer's download of a sealed file (wave 3b step 14, ADR 0036 D10). Names no supplier, no account and no submitter: a file is reached by its id at an opening, through the
 * grant sealed to the signed-in officer's own key, and the sealed table is asked only for the file's ciphertext addresses, its status and whether its bid was opened at this opening.
 * Every query is scoped to the organisation and the exercise. Nothing is written here; the access log is written by `logSealedRefusal` and `logSealedGranted`.
 */

import type { OnlineBidRules, OnlineBidStatus } from "@/lib/bids/online/types";
import { db } from "@/lib/db";

import { grantPlan } from "./online-unseal";

export interface OpeningFacts { id: string; exerciseId: string; unsealedAt: Date | null; finalisedAt: Date | null }

export async function findOpening(organisationId: string, openingId: string): Promise<OpeningFacts | null> {
  return db.opening.findFirst({ where: { id: openingId, organisationId }, select: { id: true, exerciseId: true, unsealedAt: true, finalisedAt: true } });
}

/// Whether the opening is finalised now (re-read after the passphrase, so a finalise that landed in between is honoured).
export async function isFinalised(organisationId: string, openingId: string): Promise<boolean> {
  const o = await db.opening.findFirst({ where: { id: openingId, organisationId }, select: { finalisedAt: true } });
  return o == null || o.finalisedAt != null;
}

export interface FileFacts {
  /// The signed-in person's live key at this exercise, if they are a named officer with one.
  namedOfficer: boolean;
  officerKeyId: string | null;
  file: null | {
    id: string;
    keyId: string;
    packPartId: string;
    cipherSha256: string;
    bodyIv: Uint8Array;
    sealedMeta: Uint8Array;
    /// The bid's status, and whether it was opened at THIS opening (an OpenedBid of this opening on its envelope).
    bidStatus: OnlineBidStatus;
    openedHere: boolean;
  };
  grant: null | { use: "OPENING_CHECK" | "FINALISE"; sealedDek: Uint8Array };
}

export async function loadFileFacts(i: { organisationId: string; exerciseId: string; openingId: string; personId: string; fileId: string }): Promise<FileFacts> {
  const row = await db.exerciseOpeningOfficer.findFirst({ where: { exerciseId: i.exerciseId, organisationId: i.organisationId, personId: i.personId, endedAt: null }, select: { id: true } });
  if (!row) return { namedOfficer: false, officerKeyId: null, file: null, grant: null };
  const key = await db.officerExerciseKey.findFirst({ where: { exerciseId: i.exerciseId, organisationId: i.organisationId, openingOfficerId: row.id, retiredAt: null }, select: { id: true } });

  const f = await db.onlineBidFile.findFirst({
    where: { id: i.fileId, exerciseId: i.exerciseId, organisationId: i.organisationId },
    select: { id: true, keyId: true, packPartId: true, cipherSha256: true, bodyIv: true, sealedMeta: true, part: { select: { onlineBid: { select: { status: true, envelopeId: true } } } } },
  });
  // A file no submission took is a draft: it was never sealed to anyone's grant and reads as not there.
  if (!f || !f.part) return { namedOfficer: true, officerKeyId: key?.id ?? null, file: null, grant: null };
  const bid = f.part.onlineBid;
  const openedHere = (await db.openedBid.count({ where: { openingId: i.openingId, organisationId: i.organisationId, envelopeId: bid.envelopeId } })) > 0;
  const grant = key
    ? await db.officerDekGrant.findFirst({ where: { openingId: i.openingId, organisationId: i.organisationId, officerKeyId: key.id, subject: "FILE", recordId: f.id }, select: { use: true, sealedDek: true } })
    : null;
  return {
    namedOfficer: true,
    officerKeyId: key?.id ?? null,
    file: { id: f.id, keyId: f.keyId, packPartId: f.packPartId, cipherSha256: f.cipherSha256, bodyIv: new Uint8Array(f.bodyIv), sealedMeta: new Uint8Array(f.sealedMeta), bidStatus: bid.status, openedHere },
    grant: grant ? { use: grant.use, sealedDek: new Uint8Array(grant.sealedDek) } : null,
  };
}

export interface CheckFileOffer { listingNo: number; bidder: string; files: { fileId: string; partLabel: string }[] }

/**
 * The files an officer may download at the opening check, per opened offer (ruling 20at): only those of parts the frozen bid rules mark as checked at the opening (SR-14), through `grantPlan`, the one
 * place that decides it. Only the file's id and its part's label are read, never a filename, a size or a hash: those are sealed. Called only for a named officer, between the unseal and finalising.
 */
export async function loadOpeningCheckFiles(i: { organisationId: string; exerciseId: string; openingId: string; rules: OnlineBidRules | null }): Promise<CheckFileOffer[]> {
  const opened = await db.openedBid.findMany({ where: { openingId: i.openingId, organisationId: i.organisationId }, orderBy: { listingNo: "asc" }, select: { listingNo: true, bidderNameAsRead: true, envelopeId: true } });
  if (opened.length === 0) return [];
  const bids = await db.onlineBid.findMany({
    where: { organisationId: i.organisationId, exerciseId: i.exerciseId, status: "OPENED", envelopeId: { in: opened.map((o) => o.envelopeId) } },
    select: { id: true, envelopeId: true, parts: { select: { file: { select: { id: true, packPartId: true } } } } },
  });
  const rules = i.rules?.parts ?? [];
  const out: CheckFileOffer[] = [];
  for (const o of opened) {
    const bid = bids.find((b) => b.envelopeId === o.envelopeId);
    if (!bid) continue;
    const plan = grantPlan({ files: bid.parts.map((p) => ({ fileId: p.file.id, packPartId: p.file.packPartId })), declarationBidId: bid.id, rules });
    const files = plan
      .filter((p) => p.subject === "FILE" && p.use === "OPENING_CHECK")
      .map((p) => ({ fileId: p.recordId, partLabel: rules.find((r) => r.packPartId === bid.parts.find((x) => x.file.id === p.recordId)?.file.packPartId)?.label ?? "A file" }));
    if (files.length > 0) out.push({ listingNo: o.listingNo, bidder: o.bidderNameAsRead, files });
  }
  return out;
}

/// How many of an exercise's sealed bid files still have their released data key beside no document (the mover has not filed them). A count only: no key, no name.
export async function countFilesToFile(organisationId: string, exerciseId: string): Promise<number> {
  return db.onlineBidFile.count({ where: { organisationId, exerciseId, releasedDek: { not: null } } });
}
