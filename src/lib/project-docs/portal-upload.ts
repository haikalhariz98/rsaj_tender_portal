/**
 * A contractor stages a file for a Project workspace document (plan step 5, §6; ADR 0042 D8; PW-14, PW-15, PW-32). Two halves, which the route
 * (`src/app/supplier/projects/documents/upload/route.ts`) calls in order:
 *
 * 1. `preflightProjectUpload`, BEFORE a byte of the body is read: the contract is the session's supplier's (else not found), the supplier's standing does not bar it, the contract's
 *    state opens the workspace, the document store is set up, the project class is set and open to a contractor, and the file types and size are set. Then the window (PW-38,
 *    audit L5), read without a lock on the declared length: an account already over it is answered 429 at once, so a full body is never read, sniffed and copied for nothing.
 *    The locked check in step 2 stays the authority.
 * 2. `storeProjectFile`, with the bytes: the store's own `storeUpload`, with the window judged in its `hooks.before`, on the account's own row, locked.
 *
 * NO CONTRACT LOCK is taken here, and none is held while the bytes are stored: staging takes the `SupplierAccount` row only, never the contract, the `Supplier` row or any
 * `ProjectDocument` (lock order, plan §0). The file is pinned to a version later, by the act (`store.ts`, `pinFiles`), which judges it again.
 *
 * The window (PW-32): every store version the account recorded in the last hour, attached or not, counted under its row's lock, so two uploads that arrive together cannot both
 * pass it. A refusal names the limit and when to try again; there is no meter. Server-side.
 */

import type { Tx } from "@/lib/audit/record";
import type { SupplierActor } from "@/lib/auth/types";
import { actStatusFault, actStatusText, type ContractAct } from "@/lib/contract/act-status";
import type { ContractStatus } from "@/lib/contract/types";
import { db } from "@/lib/db";
import { effectiveCap } from "@/lib/documents/limits";
import { supplierAcceptedTypes } from "@/lib/documents/media";
import { documentOrg, loadStorePolicy, storeUpload, type DocumentOrg, type UploadResult } from "@/lib/documents/service";
import { STAGED_FOR_PROJECT_DOCUMENT } from "@/lib/documents/staged-for";
import { blobStore, deploymentCeiling, type BlobStore } from "@/lib/documents/store";
import { loadProjectContext, type ProjectContext } from "@/lib/portal/projects/context-store";
import { portalStandingBarOf } from "@/lib/portal/standing-gate-store";

import { PROJECT_UPLOAD_WINDOW_MINUTES, windowFaults } from "./bounds";
import { contractorFaultText } from "./contractor-view";
import { faultText } from "./labels";
import type { Finding } from "./types";
import { contractorMayDownload } from "./visibility";

/// An answer a route sends as it is: its status, its JSON body, and the headers it carries.
export interface PortalOutcome {
  status: number;
  body: Record<string, unknown>;
  headers?: Record<string, string>;
  /// Why a REFUSED access event is written (a stable code, never shown). Null where the answer is not a refusal of the file.
  logReason?: string;
}

const out = (status: number, code: string, message: string, extra: Partial<PortalOutcome> & { body?: Record<string, unknown> } = {}): PortalOutcome => ({ status, body: { ok: false, code, message, ...(extra.body ?? {}) }, headers: extra.headers, logReason: extra.logReason });

/// The same answer for a contract that does not exist, one of another organisation and one of another contractor (a supplier learns nothing from the difference).
export const NOT_FOUND_OUTCOME = (): PortalOutcome => out(404, "NOT_FOUND", "That is not something you can open.");

export interface UploadPreflight {
  ctx: ProjectContext;
  org: DocumentOrg;
  store: BlobStore;
  /// The class every project file takes, set and open to a contractor.
  classId: string;
  /// The most one file may be (the smaller of the customer's `maxBytes` and the deployment's ceiling).
  cap: bigint;
  /// Which of the two binds, so a refusal for size says the right one.
  capFrom: "POLICY" | "CEILING";
  /// What the organisation's upload rules allow, less the types a contractor's upload cannot be (Office files are staff-only).
  allowedTypes: string[];
}

/**
 * What must hold before the body is read. Returns the facts the rest of the upload judges by, or the answer to send. Reads only (the standing bar, the contract, the settings, the
 * account's window), and takes no lock. `declaredBytes` is the request's stated length (null where it stated none: the route refuses that next): the window is judged on it, which
 * errs towards refusing, as the body is a little longer than its file.
 */
export async function preflightProjectUpload(actor: SupplierActor, contractId: string, o: { declaredBytes?: bigint | null; now?: Date; /** The act x status row that opens staging: the workspace's, or (3b) a work item's. */ act?: ContractAct } = {}): Promise<{ ok: true; value: UploadPreflight } | { ok: false; outcome: PortalOutcome }> {
  const now = o.now ?? new Date();
  const org = await documentOrg(actor.organisationId);
  if (!org) return { ok: false, outcome: out(503, "CLOSED", "The portal is not set up.", { logReason: "NO_ORGANISATION" }) };
  const ctx = await loadProjectContext(db, actor, contractId, now);
  if (!ctx) return { ok: false, outcome: { ...NOT_FOUND_OUTCOME(), logReason: "NOT_FOUND" } };
  // A supplier whose standing bars it may read its contract and do nothing else (decisions log, 2026-10-09, ruling on 1875(3)).
  const bar = await portalStandingBarOf(db, actor, "TRANSACT", now);
  if (bar) return { ok: false, outcome: out(422, "VALIDATION", bar.en, { logReason: "STANDING_BARS" }) };
  const shut = actStatusFault(o.act ?? "PROJECT_WORKSPACE", ctx.contract.status as ContractStatus);
  if (shut) return { ok: false, outcome: out(422, "VALIDATION", actStatusText(shut), { logReason: shut.code }) };

  const notSetUp = (reason: string) => out(422, "CLOSED", contractorFaultText({ code: "CLASS_NOT_SET", level: "block" }, ctx.org.name), { logReason: reason });
  const s = blobStore();
  if ("fault" in s) return { ok: false, outcome: out(503, "CLOSED", `Uploads are closed: the document store is not set up. Tell ${ctx.org.name}.`, { logReason: s.fault }) };
  const policy = await loadStorePolicy(org.id);
  if (!policy.projectDocumentClassId) return { ok: false, outcome: notSetUp("PROJECT_CLASS_NOT_SET") };
  // The class is read now: raised to SULIT, or unclassified, a contractor could never download what is staged, so nothing is staged.
  const cls = await db.documentClass.findFirst({ where: { id: policy.projectDocumentClassId, organisationId: org.id }, select: { classification: true } });
  if (!cls || !contractorMayDownload({ versionVisible: true, documentClassification: cls.classification, classClassification: cls.classification })) return { ok: false, outcome: notSetUp("PROJECT_CLASS_NOT_OPEN") };
  const cap = effectiveCap(policy, deploymentCeiling());
  if ("fault" in cap) return { ok: false, outcome: notSetUp(cap.fault) };
  const allowedTypes = supplierAcceptedTypes(policy.allowedMediaTypes);
  if (allowedTypes.length === 0) return { ok: false, outcome: notSetUp("TYPES_NOT_SET") };
  // PW-38: the window, without a lock, before the body is read. PW-32's words; the locked check in `storeProjectFile` is the authority.
  if (o.declaredBytes != null) {
    const faults = windowFaults({ staged: await windowRows(db, actor, now), incomingBytes: o.declaredBytes, now });
    if (faults.length > 0) return { ok: false, outcome: windowRefusalOutcome(new WindowRefused(faults), ctx.org.name) };
  }
  return { ok: true, value: { ctx, org, store: s.store, classId: policy.projectDocumentClassId, cap: cap.cap, capFrom: cap.from, allowedTypes } };
}

/// Raised from inside the staging transaction when the account's window is full: nothing is stored.
export class WindowRefused extends Error {
  constructor(readonly faults: readonly Finding[]) {
    super(faults.map((f) => f.code).join(", "));
    this.name = "WindowRefused";
  }
}

/// A full window as an answer: 429 with the limit and when to try again, in words, and `Retry-After` for the later of the two that bind.
export function windowRefusalOutcome(e: WindowRefused, orgName: string): PortalOutcome {
  const waits = e.faults.map((f) => f.data?.retryInMinutes).filter((m): m is number => typeof m === "number");
  const retry = waits.length > 0 && waits.length === e.faults.length ? Math.max(...waits) : null;
  const message = [...new Set(e.faults.map((f) => contractorFaultText(f, orgName)))].join(" ");
  return out(429, "RATE_LIMITED", message, { headers: retry !== null ? { "Retry-After": String(retry * 60) } : undefined, logReason: e.faults[0]?.code ?? "WINDOW", body: { faults: e.faults.map((f) => ({ message: faultText(f, orgName) })) } });
}

/// The account's store versions of the last hour (a coarse minute of slack; `windowFaults` filters exactly), attached or not: what PW-32's window counts.
export async function windowRows(client: Tx, actor: SupplierActor, now: Date): Promise<{ at: Date; bytes: bigint }[]> {
  const rows = await client.documentVersion.findMany({
    where: { organisationId: actor.organisationId, recordedBySupplierAccountId: actor.accountId, storedAt: { gte: new Date(now.getTime() - (PROJECT_UPLOAD_WINDOW_MINUTES + 1) * 60_000) } },
    select: { storedAt: true, byteSize: true },
  });
  return rows.map((r) => ({ at: r.storedAt, bytes: r.byteSize }));
}

export interface StoreProjectFileInput {
  org: DocumentOrg;
  store: BlobStore;
  classId: string;
  bytes: Uint8Array;
  sha256: string;
  mediaType: string;
  originalFilename: string;
  /// What the file is staged for: a project document's (the default), or (3b) a work item's.
  stagedFor?: string;
}

/**
 * Store the file, STAGED for a project document, recorded by the account. The window is judged on the account's row, locked, inside the store's own transaction: the account's
 * store versions of the last hour (a coarse minute of slack, then `windowFaults` filters exactly), with `now` taken after the lock. Throws `WindowRefused` (and nothing is
 * stored) where the file would not fit.
 */
export async function storeProjectFile(actor: SupplierActor, i: StoreProjectFileInput): Promise<UploadResult> {
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
      stagedFor: i.stagedFor ?? STAGED_FOR_PROJECT_DOCUMENT,
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
