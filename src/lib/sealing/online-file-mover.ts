/**
 * The mover: an online bid file, once its opening is finalised, is decrypted into the document store (ADR 0036 D10, M5; build plan step 15). It works from the data key the finalise released
 * (`releasedDek`), which needs no passphrase and no pepper, so it can run at any time after the commit and on any copy.
 *
 * One file at a time, in bounded batches. Each file runs under a transaction-scoped advisory lock taken on its id, and inside it the file is read again: a file already linked, or whose key is
 * already shredded, is left alone, so an interrupted mover resumes without duplicates and two movers never store a file twice. The document, its version and its owner link (purpose
 * ONLINE_BID_FILE, unique onlineBidFileId) are written in one transaction, and the released key is shredded in that same transaction, so a key is never gone while the file has no link, and
 * the trigger (PA015) refuses a shred before the link exists. The bytes are verified before anything is written: every GCM tag and the plain digest (`openFile`).
 *
 * "A reader of an unmoved file triggers its move": `ensureFileMoved` is that call. No reader of a moved file exists yet, so the finalise itself calls `moveReleasedFiles` once it has committed,
 * and a later reader (wave 3c's documents of a finalised bid) calls `ensureFileMoved` for the file it was asked for.
 */

import { Prisma } from "@/generated/prisma/client";
import { diffFields } from "@/lib/audit/diff";
import { writeAudit } from "@/lib/audit/record";
import { db } from "@/lib/db";
import { attached, filed } from "@/lib/documents/audit-view";
import { PURPOSE_LABEL } from "@/lib/documents/labels";
import { documentOrg, loadStorePolicy, storeUpload, UploadRefusal } from "@/lib/documents/service";
import { blobStore, sha256Hex } from "@/lib/documents/store";
import { openFile } from "@/lib/sealing/file-seal";
import { zero } from "@/lib/sealing/types";

export const MOVER_SYSTEM_LABEL = "The online bid file mover";
/// Files per batch, and the most one call moves. PRODUCT BEHAVIOUR (20e): a batch holds one file in memory at a time and the call ends well inside a request.
export const MOVE_BATCH = 10;
export const MOVE_MAX_PER_CALL = 200;

export type MoveResult =
  | { status: "MOVED"; documentId: string }
  | { status: "NOTHING_TO_MOVE" }
  | { status: "FAILED"; code: "FILE_NOT_FOUND" | "CLASS_NOT_SET" | "ORGANISATION_NOT_FOUND" | "STORE_NOT_BUILT" | "BYTES_MISSING" | "DIGEST_MISMATCH" | "FILE_UNREADABLE" | "REFUSED"; detail?: string };

class AlreadyMoved extends Error {
  constructor(readonly linkedWithKeyHeld = false) {
    super("already moved");
  }
}

/// For tests: a hook that runs inside the mover's transaction after the link and the shred were written, and may throw to prove the whole transaction rolls back.
export interface MoveOptions { beforeCommit?: () => void | Promise<void> }

export async function ensureFileMoved(organisationId: string, fileId: string, options: MoveOptions = {}): Promise<MoveResult> {
  return moveOneFile(organisationId, fileId, options);
}

async function moveOneFile(organisationId: string, fileId: string, options: MoveOptions): Promise<MoveResult> {
  const file = await db.onlineBidFile.findFirst({
    where: { id: fileId, organisationId },
    select: { id: true, exerciseId: true, keyId: true, packPartId: true, cipherSha256: true, bodyIv: true, sealedMeta: true, releasedDek: true, uploadedBySupplierAccountId: true, exercise: { select: { reference: true } }, attachment: { select: { id: true } } },
  });
  if (!file) return { status: "FAILED", code: "FILE_NOT_FOUND" };
  // Released and not linked is the only state that has work to do; a key still set beside a link is shredded by the hook below.
  if (!file.releasedDek) return { status: "NOTHING_TO_MOVE" };

  const org = await documentOrg(organisationId);
  if (!org) return { status: "FAILED", code: "ORGANISATION_NOT_FOUND" };
  const policy = await loadStorePolicy(organisationId);
  if (!policy.onlineBidFileClassId) return { status: "FAILED", code: "CLASS_NOT_SET" };
  const store = blobStore();
  if ("fault" in store) return { status: "FAILED", code: "STORE_NOT_BUILT", detail: store.fault };

  const cipher = await store.store.get(organisationId, file.cipherSha256);
  if (!cipher) return { status: "FAILED", code: "BYTES_MISSING" };
  if (sha256Hex(cipher) !== file.cipherSha256) return { status: "FAILED", code: "DIGEST_MISMATCH" };
  const dek = new Uint8Array(file.releasedDek);
  let opened: ReturnType<typeof openFile>;
  try {
    opened = openFile({ context: { organisationId, exerciseId: file.exerciseId, keyId: file.keyId, fileId: file.id, packPartId: file.packPartId }, dek, cipher: new Uint8Array(cipher), bodyIv: new Uint8Array(file.bodyIv), sealedMeta: new Uint8Array(file.sealedMeta) });
  } finally {
    zero(dek);
  }
  if (!opened.ok) return { status: "FAILED", code: opened.fault === "DIGEST_MISMATCH" ? "DIGEST_MISMATCH" : "FILE_UNREADABLE" };
  const plain = opened.plain;
  const exercise = file.exercise;

  try {
    const stored = await storeUpload(
      { kind: "SYSTEM", label: MOVER_SYSTEM_LABEL },
      {
        org,
        store: store.store,
        bytes: plain,
        sha256: sha256Hex(plain),
        mediaType: opened.meta.mediaType,
        originalFilename: opened.meta.filename,
        title: opened.meta.filename,
        documentClassId: policy.onlineBidFileClassId,
        documentId: null,
        recordedByPersonId: null,
        recordedBySupplierAccountId: file.uploadedBySupplierAccountId,
        receivedOn: null,
        note: "Filed from the sealed online bid once its opening was finalised.",
        hooks: {
          before: async (tx) => {
            // One mover per file at a time. The lock is held to the end of this transaction, so a second mover waits and then finds the link.
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`online-bid-file:${file.id}`}, 0))`;
            const now = await tx.onlineBidFile.findFirst({ where: { id: file.id, organisationId }, select: { releasedDek: true, attachment: { select: { id: true } } } });
            if (!now || !now.releasedDek) throw new AlreadyMoved();
            // Linked already (an earlier mover committed the link): nothing is stored again. A key still held beside a link is shredded after this transaction ends.
            if (now.attachment) throw new AlreadyMoved(true);
          },
          after: async (tx, created) => {
            const doc = await tx.document.findUniqueOrThrow({ where: { id: created.documentId }, select: { title: true } });
            const row = await tx.documentAttachment.create({ data: { organisationId, purpose: "ONLINE_BID_FILE", versionId: created.versionId, onlineBidFileId: file.id } });
            const actor = { kind: "SYSTEM", label: MOVER_SYSTEM_LABEL } as const;
            const owner = `${exercise?.reference ?? "Exercise"} · Online bid file`;
            await writeAudit(tx, { actor, organisationId, entity: "DocumentAttachment", entityId: row.id, entityLabel: `${owner} · ${PURPOSE_LABEL.ONLINE_BID_FILE}` }, "CREATE", attached({ purpose: "ONLINE_BID_FILE", title: doc.title, versionNo: created.versionNo, sha256: sha256Hex(plain), owner }));
            await tx.document.update({ where: { id: created.documentId, organisationId }, data: { status: "FILED", filedAt: new Date() } });
            await writeAudit(tx, { actor, organisationId, entity: "Document", entityId: created.documentId, entityLabel: `Document · ${doc.title}` }, "UPDATE", filed());
            // The key is shredded in the transaction that wrote the link: never gone while the file has none.
            await tx.onlineBidFile.update({ where: { id: file.id, organisationId }, data: { releasedDek: null } });
            await writeAudit(tx, { actor, organisationId, entity: "OnlineBidFile", entityId: file.id, entityLabel: `${owner}` }, "UPDATE", diffFields({ fileKeyHeldForTheStore: "Held" }, { fileKeyHeldForTheStore: "Shredded: the file is in the document store" }));
            await options.beforeCommit?.();
          },
        },
      },
    );
    return { status: "MOVED", documentId: stored.documentId };
  } catch (e) {
    if (e instanceof AlreadyMoved) {
      if (e.linkedWithKeyHeld) await shredLinked(organisationId, file.id);
      return { status: "NOTHING_TO_MOVE" };
    }
    if (e instanceof UploadRefusal) return { status: "FAILED", code: "REFUSED", detail: e.finding.code };
    // A lost race at the unique link, or the trigger refusing a shred out of order, is the other mover's win or a defect to see, never a half move: the transaction rolled back whole.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { status: "NOTHING_TO_MOVE" };
    throw e;
  } finally {
    zero(plain);
  }
}

/// A key still released beside a document link is shredded, which the trigger allows once the link exists. Under the file's own lock, and judged again there.
async function shredLinked(organisationId: string, fileId: string): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`online-bid-file:${fileId}`}, 0))`;
    const now = await tx.onlineBidFile.findFirst({ where: { id: fileId, organisationId }, select: { releasedDek: true, attachment: { select: { id: true } } } });
    if (now?.releasedDek && now.attachment) await tx.onlineBidFile.update({ where: { id: fileId, organisationId }, data: { releasedDek: null } });
  });
}

/// Moves the released files of an organisation, optionally of one exercise, in bounded batches. A file that cannot be moved is reported and left (its key stays released for the next call), and
/// never retried within the call. Returns what was done and how many are still waiting.
export async function moveReleasedFiles(i: { organisationId: string; exerciseId?: string; batch?: number; max?: number }, options: MoveOptions = {}): Promise<{ moved: number; failed: { fileId: string; code: string }[]; remaining: number }> {
  const batch = i.batch ?? MOVE_BATCH;
  const max = i.max ?? MOVE_MAX_PER_CALL;
  const where = { organisationId: i.organisationId, releasedDek: { not: null }, ...(i.exerciseId ? { exerciseId: i.exerciseId } : {}) } as const;
  let moved = 0;
  const failed: { fileId: string; code: string }[] = [];
  const skip = new Set<string>();
  let handled = 0;
  while (handled < max) {
    const files = await db.onlineBidFile.findMany({ where: { ...where, ...(skip.size ? { id: { notIn: [...skip] } } : {}) }, orderBy: { id: "asc" }, take: Math.min(batch, max - handled), select: { id: true } });
    if (files.length === 0) break;
    for (const f of files) {
      handled++;
      skip.add(f.id);
      const r = await moveOneFile(i.organisationId, f.id, options);
      if (r.status === "MOVED") moved++;
      else if (r.status === "FAILED") failed.push({ fileId: f.id, code: r.code });
    }
  }
  const remaining = await db.onlineBidFile.count({ where });
  return { moved, failed, remaining };
}
