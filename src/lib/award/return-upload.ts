/**
 * A contractor stages one wet-signed scan of its award return (ADR 0045 D1; wave V plan V2), mirroring the Project workspace's upload (`project-docs/portal-upload.ts`). Two
 * halves, which the upload route (V3) calls in order:
 *
 * 1. `preflightReturnUpload`, BEFORE a byte of the body is read: the contract is the session's supplier's (else not found), its standing does not bar it, the award is issued with
 *    no return waiting, the scan is one the instrument takes, the account may sign for the company, the document store is set up, the return class is set and SULIT, the
 *    file types and size are set, and the account's window (read without a lock on the declared length) has room.
 * 2. `storeReturnFile`, with the bytes: the store's own `storeUpload`, STAGED for an award return in the return class, with the window judged again on the account's own row,
 *    locked. The window is the Project workspace's (`bounds.ts`): every store version the account recorded in the last hour counts, whatever it was staged for.
 *
 * NO CONTRACT OR AWARD LOCK is taken here, and none is held while the bytes are stored. The lodge pins the file later, and judges it again under the award's lock.
 * The contractor never downloads a return file back: the class is SULIT.
 */

import type { SupplierActor } from "@/lib/auth/types";
import { db } from "@/lib/db";
import { awardReturnClassFault } from "@/lib/documents/award-return-class";
import { effectiveCap } from "@/lib/documents/limits";
import { supplierAcceptedTypes } from "@/lib/documents/media";
import { documentOrg, loadStorePolicy, storeUpload, type DocumentOrg, type UploadResult } from "@/lib/documents/service";
import { STAGED_FOR_AWARD_RETURN } from "@/lib/documents/staged-for";
import { blobStore, deploymentCeiling, type BlobStore } from "@/lib/documents/store";
import { loadProjectContext } from "@/lib/portal/projects/context-store";
import { contractorSigningFaultOf } from "@/lib/portal/projects/signing-store";
import { portalStandingBarOf } from "@/lib/portal/standing-gate-store";
import { windowFaults } from "@/lib/project-docs/bounds";
import { NOT_FOUND_OUTCOME, WindowRefused, windowRefusalOutcome, windowRows, type PortalOutcome } from "@/lib/project-docs/portal-upload";

import { scanTaken } from "./online-return";
import { awardReturnFaultText, type AwardReturnFault } from "./online-return-words";
import type { ReturnScan } from "./stage-two";
import type { InstrumentKind } from "./types";

const refused = (status: number, code: AwardReturnFault | "CLOSED", message: string, logReason: string): PortalOutcome => ({ status, body: { ok: false, code, message }, logReason });
const said = (status: number, code: AwardReturnFault, logReason: string = code, data?: Record<string, string>) => refused(status, code, awardReturnFaultText({ code, data }), logReason);

export interface ReturnUploadPreflight {
  org: DocumentOrg;
  store: BlobStore;
  /// The award return class, set and SULIT.
  classId: string;
  scan: ReturnScan;
  cap: bigint;
  capFrom: "POLICY" | "CEILING";
  allowedTypes: string[];
  orgName: string;
}

export async function preflightReturnUpload(actor: SupplierActor, contractId: string, scan: string, o: { declaredBytes?: bigint | null; now?: Date } = {}): Promise<{ ok: true; value: ReturnUploadPreflight } | { ok: false; outcome: PortalOutcome }> {
  const now = o.now ?? new Date();
  const org = await documentOrg(actor.organisationId);
  if (!org) return { ok: false, outcome: refused(503, "CLOSED", "The portal is not set up.", "NO_ORGANISATION") };
  const ctx = await loadProjectContext(db, actor, contractId, now);
  if (!ctx) return { ok: false, outcome: { ...NOT_FOUND_OUTCOME(), logReason: "NOT_FOUND" } };
  const bar = await portalStandingBarOf(db, actor, "TRANSACT", now);
  if (bar) return { ok: false, outcome: refused(422, "CLOSED", bar.en, "STANDING_BARS") };
  const award = (await db.contract.findFirst({ where: { id: contractId, organisationId: actor.organisationId }, select: { award: { select: { status: true, instrumentKind: true, onlineReturns: { where: { verifiedAt: null, refusedAt: null }, select: { id: true } } } } } }))?.award;
  if (!award) return { ok: false, outcome: { ...NOT_FOUND_OUTCOME(), logReason: "NOT_FOUND" } };
  if (award.status !== "ISSUED") return { ok: false, outcome: said(422, "NOT_ISSUED") };
  if (award.onlineReturns.length > 0) return { ok: false, outcome: said(409, "ALREADY_WAITING") };
  if (!scanTaken(award.instrumentKind as InstrumentKind, scan)) return { ok: false, outcome: said(400, "SCAN_NOT_TAKEN") };
  const signing = await contractorSigningFaultOf(db, actor);
  if (signing) return { ok: false, outcome: said(403, "NOT_SIGNING_AUTHORITY", signing, { fault: signing }) };

  const notSetUp = (reason: string) => said(422, "CLASS_NOT_SET", reason);
  const s = blobStore();
  if ("fault" in s) return { ok: false, outcome: refused(503, "CLOSED", `Uploads are closed: the document store is not set up. Tell ${ctx.org.name}.`, s.fault) };
  const policy = await loadStorePolicy(org.id);
  if (!policy.awardReturnClassId) return { ok: false, outcome: notSetUp("RETURN_CLASS_NOT_SET") };
  // Read now: a class lowered from SULIT since it was chosen no longer holds an identity card number, so nothing is staged.
  const cls = await db.documentClass.findFirst({ where: { id: policy.awardReturnClassId, organisationId: org.id }, select: { classification: true } });
  if (awardReturnClassFault(cls)) return { ok: false, outcome: notSetUp("RETURN_CLASS_NOT_SULIT") };
  const cap = effectiveCap(policy, deploymentCeiling());
  if ("fault" in cap) return { ok: false, outcome: notSetUp(cap.fault) };
  const allowedTypes = supplierAcceptedTypes(policy.allowedMediaTypes);
  if (allowedTypes.length === 0) return { ok: false, outcome: notSetUp("TYPES_NOT_SET") };
  if (o.declaredBytes != null) {
    const faults = windowFaults({ staged: await windowRows(db, actor, now), incomingBytes: o.declaredBytes, now });
    if (faults.length > 0) return { ok: false, outcome: windowRefusalOutcome(new WindowRefused(faults), ctx.org.name) };
  }
  return { ok: true, value: { org, store: s.store, classId: policy.awardReturnClassId, scan, cap: cap.cap, capFrom: cap.from, allowedTypes, orgName: ctx.org.name } };
}

export interface StoreReturnFileInput {
  org: DocumentOrg;
  store: BlobStore;
  classId: string;
  bytes: Uint8Array;
  sha256: string;
  mediaType: string;
  originalFilename: string;
}

/// Store the scan, STAGED for an award return, recorded by the account. Throws `WindowRefused` (and nothing is stored) where it would not fit the account's window.
export async function storeReturnFile(actor: SupplierActor, i: StoreReturnFileInput): Promise<UploadResult> {
  const title = Array.from(i.originalFilename).slice(0, 300).join("").trim() || "File";
  return storeUpload(
    { kind: "SUPPLIER", supplierAccountId: actor.accountId, sessionId: actor.sessionId, sourceAddress: actor.sourceAddress },
    {
      org: i.org,
      store: i.store,
      bytes: i.bytes,
      sha256: i.sha256,
      mediaType: i.mediaType,
      originalFilename: i.originalFilename,
      title,
      documentClassId: i.classId,
      documentId: null,
      recordedByPersonId: null,
      recordedBySupplierAccountId: actor.accountId,
      receivedOn: null,
      note: "",
      stagedFor: STAGED_FOR_AWARD_RETURN,
      hooks: {
        before: async (tx) => {
          await tx.$queryRaw`SELECT id FROM "SupplierAccount" WHERE id = ${actor.accountId} AND "organisationId" = ${actor.organisationId} FOR UPDATE`;
          const now = new Date();
          const faults = windowFaults({ staged: await windowRows(tx, actor, now), incomingBytes: BigInt(i.bytes.byteLength), now });
          if (faults.length > 0) throw new WindowRefused(faults);
        },
      },
    },
  );
}
