import { randomUUID } from "node:crypto";

import { diffFields } from "@/lib/audit/diff";
import { writeAudit, type Tx } from "@/lib/audit/record";
import type { SupplierActor } from "@/lib/auth/types";
import { db } from "@/lib/db";
import { blobStore, sha256Hex, type ScanResult } from "@/lib/documents/store";
import { sealingDeployment } from "@/lib/integration/sealing-deployment";
import { simulatorAllowedByDeployment } from "@/lib/integration/payment-deployment";
import type { ExerciseStatus } from "@/lib/method/types";
import { loadBidContext } from "@/lib/portal/bids/context-store";
import { MAX_DRAFT_FILES_PER_SUPPLIER_PER_EXERCISE } from "@/lib/portal/bids/limits";
import { auditActorOf } from "@/lib/portal/bids/signup-store";
import { saleStands } from "@/lib/sales/standing";
import { sealFile } from "@/lib/sealing/file-seal";
import { sealedSqlState } from "@/lib/sealing/store";
import { onlineSubmissionAllowed } from "@/lib/sealing/switch";
import { isPublished } from "@/lib/window/phase";

import { storedScan, uploadGateFaults } from "./parts";
import type { BidPartRule, OnlineBidRules, OnlineSubmissionMode, PartUploadFault, SubmissionChannel } from "./types";

/**
 * The part upload's reads and writes (ADR 0036 D5, D6; step 9). The route judges the rules (`parts.ts`) and reads the body; this file reads the exercise as the signed-in
 * supplier may see it, and writes the sealed file, its audit row and its access event in one transaction. The supplier is the session's and the time the server's.
 * Nothing here holds, stores or logs a filename or a plain byte beyond the one sealing call: the metadata is sealed, and the audit row names ids and the cipher digest only.
 */

/// Raised from inside the transaction so that nothing is written. `faults` are the rule's, said in words by the route.
export class PartRefused extends Error {
  constructor(readonly faults: readonly PartUploadFault[], readonly status: 404 | 409 | 422 = 422) {
    super(faults.join(", "));
    this.name = "PartRefused";
  }
}

export interface UploadFacts {
  organisationId: string;
  exerciseId: string;
  reference: string;
  channel: SubmissionChannel | null;
  mode: OnlineSubmissionMode | null;
  demonstration: boolean;
  gate: PartUploadFault[];
  key: { id: string; publicKey: Uint8Array; fingerprint: string } | null;
  rule: BidPartRule | null;
  draftFiles: number;
}

function rulesOf(json: unknown): BidPartRule[] | null {
  const r = json as OnlineBidRules | null;
  return r && typeof r === "object" && r.v === 1 && Array.isArray(r.parts) ? r.parts : null;
}

/// The exercise's facts for one upload, or null where the supplier may not see it (another supplier's, another organisation's, not there): the route answers 404 and writes nothing.
export async function loadUploadFacts(tx: Tx, actor: Pick<SupplierActor, "supplierId" | "organisationId">, i: { exerciseId: string; packPartId: string }, now: Date = new Date()): Promise<UploadFacts | null> {
  const ctx = await loadBidContext(tx, actor, i.exerciseId, now);
  if (!ctx) return null;
  const ex = await tx.sourcingExercise.findFirst({
    where: { id: ctx.ex.id, organisationId: actor.organisationId },
    select: { submissionChannel: true, onlineSubmissionMode: true, onlineBidRules: true, publishedKeyFingerprint: true },
  });
  if (!ex) return null;
  const status = ctx.ex.status as ExerciseStatus;
  const partyIds = ctx.parties.map((p) => p.id);
  const [key, sales, opening, drafts] = await Promise.all([
    tx.exerciseSealingKey.findFirst({ where: { exerciseId: ctx.ex.id, organisationId: actor.organisationId, retiredAt: null }, select: { id: true, publicKey: true, fingerprint: true } }),
    ctx.ex.window && partyIds.length ? tx.documentSale.findMany({ where: { windowId: ctx.ex.window.id, organisationId: actor.organisationId, partyId: { in: partyIds } }, select: { voidedAt: true, paymentChannel: true } }) : Promise.resolve([]),
    tx.opening.findFirst({ where: { exerciseId: ctx.ex.id, organisationId: actor.organisationId, kind: "MAIN" }, select: { startedAt: true } }),
    tx.onlineBidFile.count({ where: { exerciseId: ctx.ex.id, organisationId: actor.organisationId, supplierId: actor.supplierId, state: "DRAFT" } }),
  ]);
  const simulator = simulatorAllowedByDeployment();
  const online = onlineSubmissionAllowed(ex.onlineSubmissionMode, sealingDeployment(), "SUBMIT");
  const rules = rulesOf(ex.onlineBidRules);
  const gate = uploadGateFaults({
    channel: ex.submissionChannel,
    online,
    published: isPublished(status),
    cancelled: status === "CANCELLED",
    keyLive: key != null,
    fingerprintMatches: key != null && ex.publishedKeyFingerprint != null && key.fingerprint === ex.publishedKeyFingerprint,
    saleStands: sales.some((s) => saleStands({ voidedAt: s.voidedAt, paymentChannel: s.paymentChannel }, simulator)),
    invitedPath: ctx.path === "INVITED",
    onInviteeList: ctx.parties.some((p) => p.hasLetter),
    mainOpeningStartedAt: opening?.startedAt ?? null,
  });
  return {
    organisationId: actor.organisationId,
    exerciseId: ctx.ex.id,
    reference: ctx.ex.reference,
    channel: ex.submissionChannel,
    mode: ex.onlineSubmissionMode,
    demonstration: online.demonstration,
    gate,
    key: key ? { id: key.id, publicKey: new Uint8Array(key.publicKey), fingerprint: key.fingerprint } : null,
    rule: rules?.find((r) => r.packPartId === i.packPartId) ?? null,
    draftFiles: drafts,
  };
}

/// One line in the sealed access log (NFR-SEC-003, 20w). Never a filename. The exercise must be the organisation's: the column is a foreign key.
export async function logPartAccess(
  tx: Pick<Tx, "sealedAccessEvent">,
  actor: Pick<SupplierActor, "organisationId" | "accountId" | "sessionId" | "sourceAddress">,
  i: { exerciseId: string; kind: "PART_UPLOAD" | "PART_DISCARD"; outcome: "GRANTED" | "REFUSED"; reasonCode?: string; recordId?: string | null },
  now: Date = new Date(),
): Promise<void> {
  await tx.sealedAccessEvent.create({
    data: { organisationId: actor.organisationId, exerciseId: i.exerciseId, kind: i.kind, outcome: i.outcome, reasonCode: i.reasonCode ?? "", supplierAccountId: actor.accountId, sessionId: actor.sessionId, sourceAddress: actor.sourceAddress, recordId: i.recordId ?? null, at: now },
  });
}

/// A refusal outside any transaction. Written only where the exercise is the organisation's (a probe of an id that is not leaves no row).
export async function logPartRefusal(actor: SupplierActor, exerciseId: string, kind: "PART_UPLOAD" | "PART_DISCARD", reasonCode: string): Promise<void> {
  const ex = await db.sourcingExercise.findFirst({ where: { id: exerciseId, organisationId: actor.organisationId }, select: { id: true } });
  if (!ex) return;
  await logPartAccess(db, actor, { exerciseId: ex.id, kind, outcome: "REFUSED", reasonCode });
}

export interface StoreInput {
  facts: UploadFacts;
  packPartId: string;
  plain: Uint8Array;
  filename: string;
  mediaType: string;
  scan: ScanResult;
  scannerConfigured: boolean;
}

export interface StoredPart { fileId: string; packPartId: string; plainSha256: string; plainBytes: number; scan: "CLEAN" | "NOT_SCANNED" }

const TX = { timeout: 30_000, maxWait: 10_000 } as const;
const lockSupplierExercise = (tx: Tx, organisationId: string, supplierId: string, exerciseId: string) =>
  tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`bid-part:${organisationId}:${supplierId}:${exerciseId}`}, 0))`;

/**
 * Seals the part and writes it as a DRAFT (ADR 0036 D5, D6). The data key and the metadata are made here and zeroed by `sealFile`; the ciphertext goes to the document store by
 * its digest, beside the row, in the same transaction. The supplier's drafts are counted again under an advisory lock on the supplier and the exercise, so two uploads that arrive
 * together cannot both pass the cap, and the live key is read again, so an upload sealed to a key that was re-made meanwhile is refused (the database's own check, PA024, is
 * the last word and is said as KEY_NOT_LIVE too).
 */
export async function storePart(actor: SupplierActor, i: StoreInput, now: Date = new Date()): Promise<StoredPart> {
  const store = blobStore();
  if ("fault" in store) throw new Error("The document store is not set up.");
  const key = i.facts.key;
  if (!key) throw new PartRefused(["KEY_NOT_LIVE"]);
  // The route has already refused any scan `storedScan` refuses; this narrows the type and fails closed.
  const stored = storedScan(i.scan, i.facts.mode ?? "LIVE", i.scannerConfigured);
  if (stored === null) throw new PartRefused([i.scan === "THREAT" ? "THREAT" : "SCAN_ERROR"]);
  const fileId = randomUUID();
  const plainSha256 = sha256Hex(i.plain);
  const sealed = sealFile({
    context: { organisationId: actor.organisationId, exerciseId: i.facts.exerciseId, keyId: key.id, fileId, packPartId: i.packPartId },
    exercisePublicKey: key.publicKey,
    plain: i.plain,
    meta: { v: 1, filename: i.filename, mediaType: i.mediaType, plainSha256, plainBytes: String(i.plain.byteLength) },
  });
  const cipherSha256 = sha256Hex(sealed.cipher);
  try {
    await db.$transaction(async (tx) => {
      await lockSupplierExercise(tx, actor.organisationId, actor.supplierId, i.facts.exerciseId);
      const live = await tx.exerciseSealingKey.findFirst({ where: { exerciseId: i.facts.exerciseId, organisationId: actor.organisationId, retiredAt: null }, select: { id: true } });
      if (!live || live.id !== key.id) throw new PartRefused(["KEY_NOT_LIVE"], 409);
      const held = await tx.onlineBidFile.count({ where: { exerciseId: i.facts.exerciseId, organisationId: actor.organisationId, supplierId: actor.supplierId, state: "DRAFT" } });
      if (held >= MAX_DRAFT_FILES_PER_SUPPLIER_PER_EXERCISE) throw new PartRefused(["TOO_MANY_DRAFT_FILES"]);
      await store.store.put(tx, actor.organisationId, cipherSha256, sealed.cipher);
      await tx.onlineBidFile.create({
        data: {
          id: fileId,
          organisationId: actor.organisationId,
          exerciseId: i.facts.exerciseId,
          keyId: key.id,
          supplierId: actor.supplierId,
          uploadedBySupplierAccountId: actor.accountId,
          packPartId: i.packPartId,
          cipherSha256,
          cipherBytes: BigInt(sealed.cipher.byteLength),
          sealedDek: sealed.sealedDek as Uint8Array<ArrayBuffer>,
          sealedMeta: sealed.sealedMeta as Uint8Array<ArrayBuffer>,
          bodyIv: sealed.bodyIv as Uint8Array<ArrayBuffer>,
          scan: stored,
          state: "DRAFT",
          uploadedAt: now,
        },
      });
      await writeAudit(
        tx,
        { actor: auditActorOf(actor), organisationId: actor.organisationId, entity: "OnlineBidFile", entityId: fileId, entityLabel: `${i.facts.reference} · bid part uploaded (sealed)` },
        "CREATE",
        diffFields(null, { exercise: i.facts.exerciseId, part: i.packPartId, keyId: key.id, cipherSha256, cipherBytes: String(sealed.cipher.byteLength), scan: stored, state: "DRAFT" }),
      );
      await logPartAccess(tx, actor, { exerciseId: i.facts.exerciseId, kind: "PART_UPLOAD", outcome: "GRANTED", recordId: fileId }, now);
    }, TX);
  } catch (e) {
    if (e instanceof PartRefused) throw e;
    // The database's own refusal of an upload under a key that is no longer live (PA024): said as the rule, never thrown at the supplier.
    if (sealedSqlState(e) === "PA024") throw new PartRefused(["KEY_NOT_LIVE"], 409);
    throw e;
  }
  return { fileId, packPartId: i.packPartId, plainSha256, plainBytes: i.plain.byteLength, scan: stored };
}

export type DiscardResult = { ok: true; changed: boolean } | { ok: false; reason: "NOT_FOUND" | "FILE_NOT_DRAFT" };

/// The supplier's own draft, discarded. Another supplier's file, another exercise's and one that does not exist all answer NOT_FOUND. A file already discarded is discarded
/// (nothing is written); a file a submission took cannot be.
export async function discardPart(actor: SupplierActor, i: { exerciseId: string; fileId: string }, now: Date = new Date()): Promise<DiscardResult> {
  return db.$transaction(async (tx) => {
    const ctx = await loadBidContext(tx, actor, i.exerciseId, now);
    if (!ctx) return { ok: false, reason: "NOT_FOUND" } as const;
    await lockSupplierExercise(tx, actor.organisationId, actor.supplierId, ctx.ex.id);
    const file = await tx.onlineBidFile.findFirst({ where: { id: i.fileId, exerciseId: ctx.ex.id, organisationId: actor.organisationId, supplierId: actor.supplierId }, select: { id: true, state: true } });
    if (!file) return { ok: false, reason: "NOT_FOUND" } as const;
    if (file.state === "DISCARDED") return { ok: true, changed: false } as const;
    if (file.state !== "DRAFT") {
      await logPartAccess(tx, actor, { exerciseId: ctx.ex.id, kind: "PART_DISCARD", outcome: "REFUSED", reasonCode: "FILE_NOT_DRAFT", recordId: file.id }, now);
      return { ok: false, reason: "FILE_NOT_DRAFT" } as const;
    }
    await tx.onlineBidFile.update({ where: { id: file.id }, data: { state: "DISCARDED" } });
    await writeAudit(
      tx,
      { actor: auditActorOf(actor), organisationId: actor.organisationId, entity: "OnlineBidFile", entityId: file.id, entityLabel: `${ctx.ex.reference} · bid part discarded` },
      "UPDATE",
      diffFields({ state: "DRAFT" }, { state: "DISCARDED" }),
    );
    await logPartAccess(tx, actor, { exerciseId: ctx.ex.id, kind: "PART_DISCARD", outcome: "GRANTED", reasonCode: "", recordId: file.id }, now);
    return { ok: true, changed: true } as const;
  }, TX);
}
