import { randomUUID } from "node:crypto";

import { diffFields } from "@/lib/audit/diff";
import { writeAudit, type Tx } from "@/lib/audit/record";
import { attributeSupplierAct } from "@/lib/auth/supplier-attribution-store";
import type { SupplierActor } from "@/lib/auth/types";
import { db } from "@/lib/db";
import { formatOrgDateTime } from "@/lib/format";
import { lockEnvelopeRows } from "@/lib/bids/lock";
import { lockExerciseSide } from "@/lib/portal/bids/lock";
import { auditActorOf } from "@/lib/portal/bids/signup-store";
import { sealSubmission } from "@/lib/sealing/bid-seal";
import { sealedSqlState } from "@/lib/sealing/store";

import { submitFaultOfRefusal, withdrawFaultOfRefusal, type SubmitStep, type WithdrawStep } from "./act-refusal";
import { receiptDigest } from "./receipt";
import { submitFaults, withdrawalEffect, withdrawFaults } from "./submission";
import type { Declaration, OnlineBidKind, OnlineBidStatus, Receipt, SubmissionWarning, SubmitFault, WithdrawFault } from "./types";
import { loadDoorFacts, logPartAccess, logPartRefusal } from "./upload-store";

/**
 * An online submission, a replace and a withdrawal against a real database (ADR 0036 D5, D7, D8; rulings 17c, 20a, 20b, 20h, 20aa; build plan step 10).
 *
 * One transaction per act, at READ COMMITTED (the default; nothing here sets another, and a test pins it): the one-standing-bid trigger reads a fresh count after its lock only at that
 * isolation. The act takes the exercise and window locks, then the envelopes', reads the exercise as this supplier may see it, judges the rules again on the locked rows, and writes in the
 * order the triggers read what is already written. The stamp is the caller's: taken from the database clock after the small body was read and before the password check (20aa), so a
 * slow hash or a wait on the locks cannot make a late bid look in time. The database checks it again at the moment of the insert and refuses one older than the skew.
 *
 * A refusal the database makes after the door passed is said in words (`act-refusal.ts`) and the transaction is rolled back with it. It is never thrown at the supplier. A refusal of the
 * rules writes one `SealedAccessEvent` REFUSED outside the refused transaction; none counts toward any lockout.
 */

/// Longer than the stamp skew on purpose: a wait on the locks that outlasts the skew must end at the database's refusal of the stamp (STAMP_STALE), never at the client's own timeout.
const ACT_TX = { timeout: 90_000, maxWait: 20_000 } as const;

/// The database clock, to the second, on the basis the triggers read it (`sealed_clock()`: UTC, `clock_timestamp()`). Its own statement, so it is the moment it is read.
export async function takeStamp(client: Pick<Tx, "$queryRaw"> = db): Promise<Date> {
  const rows = await client.$queryRaw<{ stamp: Date }[]>`SELECT date_trunc('second', clock_timestamp() AT TIME ZONE 'UTC') AS stamp`;
  return rows[0].stamp;
}

class ActNotFound extends Error {}
class ActRefused extends Error {
  constructor(readonly faults: readonly string[]) {
    super(faults.join(", "));
  }
}

const KIND_WORDS: Record<OnlineBidKind, string> = { BID: "Bid", ALTERNATIVE: "Alternative bid" };
const STATUS_WORDS: Record<OnlineBidStatus, string> = { SUBMITTED: "Standing", REPLACED: "Replaced", WITHDRAWN: "Withdrawn", OPENED: "Opened" };

export interface SubmitInput {
  exerciseId: string;
  kind: OnlineBidKind;
  parentOnlineBidId: string | null;
  replacesOnlineBidId: string | null;
  fileIds: string[];
  declaration: Declaration;
  /// From `takeStamp`, before the password check.
  stamp: Date;
  /// From `confirmSupplierPassword`: when the password was asked again for this act.
  stepUpAt: Date | null;
}

export type SubmitResult =
  | { ok: true; receipt: Receipt; warnings: SubmissionWarning[]; onlineBidId: string }
  | { ok: false; reason: "NOT_FOUND" }
  | { ok: false; reason: "REFUSED"; faults: SubmitFault[] };

/// Test seams: `afterDoors` runs once the rules have passed on the locked rows and before the first write.
export interface ActHooks { afterDoors?: (tx: Tx) => Promise<void> }

export async function submitBid(actor: SupplierActor, i: SubmitInput, hooks: ActHooks = {}, now: Date = new Date()): Promise<SubmitResult> {
  const at = { step: "DOORS" as SubmitStep };
  try {
    const done = await db.$transaction(async (tx) => {
      if (!(await lockExerciseSide(tx, actor.organisationId, i.exerciseId))) throw new ActNotFound();
      await lockEnvelopeRows(tx, i.exerciseId);
      const door = await loadDoorFacts(tx, actor, i.exerciseId, now);
      if (!door) throw new ActNotFound();
      const exerciseId = door.ctx.ex.id;
      const reference = door.ctx.ex.reference;
      const closing = door.ctx.ex.closingAt;
      const window = await tx.exerciseWindow.findFirst({ where: { exerciseId, organisationId: actor.organisationId }, select: { alternativesPermitted: true } });
      const mine = await tx.onlineBid.findMany({ where: { exerciseId, organisationId: actor.organisationId, supplierId: actor.supplierId }, select: { id: true, kind: true, status: true } });
      const byId = new Map(mine.map((b) => [b.id, b]));
      const files = await tx.onlineBidFile.findMany({
        where: { id: { in: i.fileIds }, exerciseId, organisationId: actor.organisationId, supplierId: actor.supplierId },
        select: { id: true, state: true, packPartId: true, keyId: true, cipherSha256: true },
      });
      const fileById = new Map(files.map((f) => [f.id, f]));
      const returned = (door.rules ?? []).filter((r) => r.returnedByBidder);
      const key = door.key;

      const replaced = i.replacesOnlineBidId === null ? null : byId.get(i.replacesOnlineBidId);
      const parent = i.parentOnlineBidId === null ? null : byId.get(i.parentOnlineBidId);
      const judged = submitFaults({
        channel: door.channel, online: door.online, published: door.published, cancelled: door.cancelled,
        keyLive: key != null && door.fingerprintMatches,
        saleStands: door.saleStands, invitedPath: door.invitedPath, onInviteeList: door.onInviteeList,
        stamp: i.stamp, closing: closing ?? new Date(0), mainOpeningStartedAt: door.mainOpeningStartedAt,
        liveMainStanding: mine.some((b) => b.kind === "BID" && b.status === "SUBMITTED"), kind: i.kind,
        // An id that is not this supplier's own, or not there, reads the same: not a standing submission of its own.
        replaces: i.replacesOnlineBidId === null ? null : replaced ? { status: replaced.status, mine: true, kind: replaced.kind } : { status: "SUBMITTED", mine: false, kind: i.kind },
        parent: i.parentOnlineBidId === null ? "NONE_NAMED" : parent ? { status: parent.status, mine: true, kind: parent.kind } : null,
        alternativesPermitted: window?.alternativesPermitted ?? null,
        files: i.fileIds.map((id) => {
          const f = fileById.get(id);
          // A draft sealed to a key that is no longer live cannot be taken: it reads as no longer waiting, and must be uploaded again.
          if (f) return { mine: true, state: key && f.keyId !== key.id ? ("DISCARDED" as const) : f.state, packPartId: f.packPartId };
          return { mine: false, state: "DRAFT" as const, packPartId: returned[0]?.packPartId ?? "" };
        }),
        rules: door.rules ?? [],
        submissionsBySupplier: mine.length,
      });
      // A closing that is not set refuses the whole exercise at the door, as the database does.
      const faults: SubmitFault[] = closing === null ? [...judged.faults, "NOT_PUBLISHED"] : judged.faults;
      if (faults.length > 0 || !key) throw new ActRefused(faults.length > 0 ? faults : ["KEY_NOT_LIVE"]);
      if (hooks.afterDoors) await hooks.afterDoors(tx);

      const sequence = ((await tx.bidEnvelope.aggregate({ where: { exerciseId, organisationId: actor.organisationId }, _max: { sequence: true } }))._max.sequence ?? 0) + 1;
      const onlineBidId = randomUUID();
      const envelopeId = randomUUID();
      const ordered = i.fileIds.map((id) => fileById.get(id)!);
      const sealed = sealSubmission({
        context: { organisationId: actor.organisationId, exerciseId, keyId: key.id, onlineBidId },
        exercisePublicKey: key.publicKey,
        declaration: i.declaration,
        manifest: {
          v: 1, exerciseId, onlineBidId, supplierId: actor.supplierId, supplierAccountId: actor.accountId, kind: i.kind,
          parentOnlineBidId: i.parentOnlineBidId, replacesOnlineBidId: i.replacesOnlineBidId,
          files: ordered.map((f) => ({ fileId: f.id, packPartId: f.packPartId, cipherSha256: f.cipherSha256 })),
        },
      });
      const digest = receiptDigest({
        exerciseId, sequence, receivedAt: i.stamp, keyFingerprint: key.fingerprint,
        manifestCipherSha256: sealed.manifestCipherSha256, declarationCipherSha256: sealed.declarationCipherSha256, fileCipherSha256s: ordered.map((f) => f.cipherSha256),
      });

      // 1. The ONLINE envelope. Trigger 1 owns `late` and checks the stamp against the clock at this moment.
      at.step = "ENVELOPE";
      const envelope = await tx.bidEnvelope.create({
        data: {
          id: envelopeId, organisationId: actor.organisationId, exerciseId, sequence, kind: i.kind, channel: "ONLINE", receivedAt: i.stamp, receivedSource: "PORTAL", markings: "",
          late: judged.late, recordedAfterClosing: judged.late, closingAtJudged: closing,
        },
        select: { late: true, receivedAt: true },
      });
      // 2. The submission. On a replace the old one is still SUBMITTED here (trigger 3 requires it).
      at.step = "BID";
      await tx.onlineBid.create({
        data: {
          id: onlineBidId, organisationId: actor.organisationId, exerciseId, keyId: key.id, envelopeId, supplierId: actor.supplierId, submittedBySupplierAccountId: actor.accountId, kind: i.kind,
          parentOnlineBidId: i.parentOnlineBidId, replacesOnlineBidId: i.replacesOnlineBidId,
          sealedManifest: sealed.sealedManifest as Uint8Array<ArrayBuffer>, manifestDek: sealed.manifestDek as Uint8Array<ArrayBuffer>, manifestCipherSha256: sealed.manifestCipherSha256,
          sealedDeclaration: sealed.sealedDeclaration as Uint8Array<ArrayBuffer>, declarationDek: sealed.declarationDek as Uint8Array<ArrayBuffer>, declarationCipherSha256: sealed.declarationCipherSha256,
          receiptDigest: digest,
        },
      });
      // 3. The parts, then each file DRAFT to SUBMITTED.
      at.step = "PARTS";
      await tx.onlineBidPart.createMany({ data: ordered.map((f) => ({ organisationId: actor.organisationId, onlineBidId, fileId: f.id })) });
      at.step = "FILES";
      const taken = await tx.onlineBidFile.updateMany({ where: { id: { in: ordered.map((f) => f.id) }, state: "DRAFT", supplierId: actor.supplierId }, data: { state: "SUBMITTED" } });
      if (taken.count !== ordered.length) throw new ActRefused(["FILE_NOT_DRAFT"]);

      if (replaced) {
        // 4. The old submission to REPLACED, with the new envelope's stamp (trigger 2 refuses any other value).
        at.step = "REPLACED";
        await tx.onlineBid.update({ where: { id: replaced.id }, data: { status: "REPLACED", statusAt: envelope.receivedAt } });
        // 5. Its envelope follows.
        at.step = "ENVELOPE_FOLLOWS";
        const old = await tx.onlineBid.findUniqueOrThrow({ where: { id: replaced.id }, select: { envelopeId: true } });
        await tx.bidEnvelope.update({ where: { id: old.envelopeId }, data: { status: "SUPERSEDED" } });
        // 6. Each standing alternative that named the old one now names the new one (trigger 6 allows it only after step 4, in this transaction).
        at.step = "REPOINT";
        await tx.onlineBid.updateMany({ where: { parentOnlineBidId: replaced.id, status: "SUBMITTED", supplierId: actor.supplierId }, data: { parentOnlineBidId: onlineBidId } });
      }

      // The signed attribution, the audit row and the access event: the act and its record commit together or not at all.
      at.step = "ATTRIBUTION";
      await attributeSupplierAct(tx, { actor, entity: "OnlineBid", entityId: onlineBidId, slot: "submittedBy", stepUpAt: i.stepUpAt, document: { entity: "OnlineBid", id: onlineBidId } });
      at.step = "RECORD";
      await writeAudit(
        tx,
        { actor: auditActorOf(actor), organisationId: actor.organisationId, entity: "OnlineBid", entityId: onlineBidId, entityLabel: `${reference} · online submission ${sequence} (sealed)` },
        "CREATE",
        diffFields(null, {
          exercise: exerciseId,
          kind: KIND_WORDS[i.kind],
          submissionNumber: sequence,
          received: formatOrgDateTime(envelope.receivedAt, actor.organisationTimeZone ?? null),
          lateness: envelope.late ? "Received after the closing" : "Received in time",
          keyId: key.id,
          parts: String(ordered.length),
          replaces: i.replacesOnlineBidId,
          parent: i.parentOnlineBidId,
          manifestCipherSha256: sealed.manifestCipherSha256,
          declarationCipherSha256: sealed.declarationCipherSha256,
          receiptDigest: digest,
          status: STATUS_WORDS.SUBMITTED,
        }),
      );
      if (replaced) {
        await writeAudit(
          tx,
          { actor: auditActorOf(actor), organisationId: actor.organisationId, entity: "OnlineBid", entityId: replaced.id, entityLabel: `${reference} · online submission replaced` },
          "UPDATE",
          diffFields({ status: STATUS_WORDS.SUBMITTED }, { status: STATUS_WORDS.REPLACED, replacedBy: onlineBidId }),
        );
      }
      await logPartAccess(tx, actor, { exerciseId, kind: "SUBMIT", outcome: "GRANTED", recordId: onlineBidId }, now);
      at.step = "COMMIT";
      return {
        onlineBidId,
        exerciseId,
        warnings: judged.warnings,
        receipt: {
          exerciseId, sequence, receivedAt: envelope.receivedAt.toISOString(), late: envelope.late, keyFingerprint: key.fingerprint, receiptDigest: digest,
          demonstration: door.online.demonstration, alternativeNotConsidered: judged.alternativeNotConsidered,
        } satisfies Receipt,
      };
    }, ACT_TX);
    return { ok: true, receipt: done.receipt, warnings: done.warnings, onlineBidId: done.onlineBidId };
  } catch (e) {
    if (e instanceof ActNotFound) return { ok: false, reason: "NOT_FOUND" };
    if (e instanceof ActRefused) {
      const faults = e.faults as SubmitFault[];
      await logPartRefusal(actor, i.exerciseId, "SUBMIT", faults[0]);
      return { ok: false, reason: "REFUSED", faults };
    }
    const state = sealedSqlState(e);
    if (state !== null) {
      const fault = submitFaultOfRefusal(state, at.step);
      // The SQLSTATE and the step go to the server log, never to the supplier. No body, no declaration, no filename.
      console.error(`online submit refused by the database: ${state} at ${at.step}`);
      await logPartRefusal(actor, i.exerciseId, "SUBMIT", fault);
      return { ok: false, reason: "REFUSED", faults: [fault] };
    }
    throw e;
  }
}

export interface WithdrawInput {
  onlineBidId: string;
  alsoWithdraw: string[];
  /// From `takeStamp`, before the password check.
  stamp: Date;
}

export type WithdrawResult =
  | { ok: true; withdrawn: string[]; linksCleared: string[] }
  | { ok: false; reason: "NOT_FOUND" }
  | { ok: false; reason: "REFUSED"; faults: WithdrawFault[] };

/**
 * Withdraws the supplier's own standing submission, and with it the alternatives it names (20h); the other alternatives linked to it are kept with their link cleared. Judged on the
 * locked rows, written in the order the triggers read: the target, then its envelope; each named alternative and its envelope; then each kept alternative's link. A submission that is
 * not the supplier's own, or not there, answers NOT_FOUND, the same for both.
 */
export async function withdrawBid(actor: SupplierActor, i: WithdrawInput, hooks: ActHooks = {}, now: Date = new Date()): Promise<WithdrawResult> {
  const at = { step: "DOORS" as WithdrawStep };
  // The exercise is read without a lock to know what to lock, as the staff side does, and only for the supplier's own submission.
  const located = await db.onlineBid.findFirst({ where: { id: i.onlineBidId, organisationId: actor.organisationId, supplierId: actor.supplierId }, select: { exerciseId: true } });
  if (!located) return { ok: false, reason: "NOT_FOUND" };
  const exerciseId = located.exerciseId;
  try {
    const done = await db.$transaction(async (tx) => {
      if (!(await lockExerciseSide(tx, actor.organisationId, exerciseId))) throw new ActNotFound();
      await lockEnvelopeRows(tx, exerciseId);
      const door = await loadDoorFacts(tx, actor, exerciseId, now);
      if (!door) throw new ActNotFound();
      const mine = await tx.onlineBid.findMany({
        where: { exerciseId, organisationId: actor.organisationId, supplierId: actor.supplierId },
        select: { id: true, kind: true, status: true, parentOnlineBidId: true, envelopeId: true },
      });
      const target = mine.find((b) => b.id === i.onlineBidId);
      if (!target) throw new ActNotFound();
      const linked = mine.filter((b) => b.parentOnlineBidId === target.id && b.status === "SUBMITTED" && b.kind === "ALTERNATIVE");
      const faults = withdrawFaults({
        mine: true, status: target.status, stamp: i.stamp, closing: door.ctx.ex.closingAt ?? new Date(0), cancelled: door.cancelled,
        alsoWithdraw: i.alsoWithdraw.map((id) => ({ mine: mine.some((b) => b.id === id), linkedToThis: linked.some((b) => b.id === id) })),
      });
      if (faults.length > 0) throw new ActRefused(faults);
      if (hooks.afterDoors) await hooks.afterDoors(tx);

      const effect = withdrawalEffect(target.id, linked.map((b) => b.id), i.alsoWithdraw);
      const envelopeOf = new Map(mine.map((b) => [b.id, b.envelopeId]));
      for (const [index, id] of effect.withdraw.entries()) {
        at.step = index === 0 ? "TARGET" : "ALTERNATIVES";
        await tx.onlineBid.update({ where: { id }, data: { status: "WITHDRAWN", statusAt: i.stamp } });
        if (index === 0) at.step = "TARGET_ENVELOPE";
        await tx.bidEnvelope.update({ where: { id: envelopeOf.get(id)! }, data: { status: "WITHDRAWN" } });
      }
      at.step = "LINKS";
      for (const id of effect.clearLink) await tx.onlineBid.update({ where: { id }, data: { parentOnlineBidId: null } });

      at.step = "RECORD";
      for (const id of effect.withdraw) {
        await writeAudit(
          tx,
          { actor: auditActorOf(actor), organisationId: actor.organisationId, entity: "OnlineBid", entityId: id, entityLabel: `${door.ctx.ex.reference} · online submission withdrawn` },
          "UPDATE",
          diffFields({ status: STATUS_WORDS.SUBMITTED }, { status: STATUS_WORDS.WITHDRAWN, withdrawn: formatOrgDateTime(i.stamp, actor.organisationTimeZone ?? null) }),
        );
      }
      for (const id of effect.clearLink) {
        await writeAudit(
          tx,
          { actor: auditActorOf(actor), organisationId: actor.organisationId, entity: "OnlineBid", entityId: id, entityLabel: `${door.ctx.ex.reference} · alternative kept, its link to the withdrawn bid cleared` },
          "UPDATE",
          diffFields({ parent: target.id }, { parent: null }),
        );
      }
      await logPartAccess(tx, actor, { exerciseId, kind: "WITHDRAW", outcome: "GRANTED", recordId: target.id }, now);
      at.step = "COMMIT";
      return effect;
    }, ACT_TX);
    return { ok: true, withdrawn: done.withdraw, linksCleared: done.clearLink };
  } catch (e) {
    if (e instanceof ActNotFound) return { ok: false, reason: "NOT_FOUND" };
    if (e instanceof ActRefused) {
      const faults = e.faults as WithdrawFault[];
      await logPartRefusal(actor, exerciseId, "WITHDRAW", faults[0]);
      return { ok: false, reason: "REFUSED", faults };
    }
    const state = sealedSqlState(e);
    if (state !== null) {
      const fault = withdrawFaultOfRefusal(state, at.step);
      console.error(`online withdrawal refused by the database: ${state} at ${at.step}`);
      await logPartRefusal(actor, exerciseId, "WITHDRAW", fault);
      return { ok: false, reason: "REFUSED", faults: [fault] };
    }
    throw e;
  }
}

/// A rate refusal of a withdrawal, outside any transaction, written only where the submission is the supplier's own (a probe of an id that is not leaves no row).
export async function logWithdrawRefusal(actor: SupplierActor, onlineBidId: string, reasonCode: string): Promise<void> {
  const own = await db.onlineBid.findFirst({ where: { id: onlineBidId, organisationId: actor.organisationId, supplierId: actor.supplierId }, select: { exerciseId: true } });
  if (own) await logPartRefusal(actor, own.exerciseId, "WITHDRAW", reasonCode);
}
