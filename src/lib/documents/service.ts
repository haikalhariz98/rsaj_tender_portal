/**
 * The document store's writes that are not an owner's: storing an upload, logging an
 * access, and the reads they need. Server-side; every rule it applies is a pure
 * function from this directory, run on rows read inside the write's transaction.
 */

import type { Prisma } from "@/generated/prisma/client";
import { writeAudit, type Tx } from "@/lib/audit/record";
import { dayToDate, storedDay, todayIn } from "@/lib/dates";
import { db } from "@/lib/db";
import { ORGANISATION_CODE } from "@/lib/org";

import { filenameFault } from "./access";
import { lockDocument, shareDocumentClass } from "./lock";
import { documentCreated, versionCreated } from "./audit-view";
import { receivedOnFault } from "./received";
import { isRetentionRule, type RetentionRule } from "./retention";
import type { BlobStore } from "./store";
import type { AccessKind, Finding, SecurityClass, StorePolicy } from "./types";
import { nextVersionFault, nextVersionNo } from "./versioning";
import type { AuditActor } from "@/lib/auth/types";

export interface DocumentOrg {
  id: string;
  timeZone: string | null;
  /// Null while the organisation has no time zone.
  today: string | null;
}

export async function documentOrg(client: Tx = db): Promise<DocumentOrg | null> {
  const org = await client.organisation.findUnique({ where: { code: ORGANISATION_CODE }, select: { id: true, timeZone: true } });
  return org ? { id: org.id, timeZone: org.timeZone, today: todayIn(new Date(), org.timeZone) } : null;
}

export async function loadStorePolicy(organisationId: string, client: Tx = db): Promise<StorePolicy & { provenance: string | null; notes: string; id: string | null }> {
  const p = await client.documentStorePolicy.findUnique({ where: { organisationId } });
  if (!p) return { id: null, allowedMediaTypes: [], maxBytes: null, provenance: null, notes: "" };
  return { id: p.id, allowedMediaTypes: p.allowedMediaTypes, maxBytes: p.maxBytes, provenance: p.provenance, notes: p.notes };
}

/// Append one access event. Refusals and downloads are logged even where nothing else is written.
export async function logAccess(
  e: { organisationId: string; kind: AccessKind; reasonCode?: string; versionId?: string | null; offeredFilename?: string | null; offeredBytes?: bigint | null },
  client: Tx = db,
): Promise<void> {
  await client.documentAccessEvent.create({
    data: {
      organisationId: e.organisationId,
      kind: e.kind,
      reasonCode: e.reasonCode ?? "",
      versionId: e.versionId ?? null,
      // A log field, so cut (by code point, never through a surrogate pair), unlike a stored name.
      offeredFilename: e.offeredFilename ? Array.from(e.offeredFilename).slice(0, 255).join("") : null,
      offeredBytes: e.offeredBytes ?? null,
    },
  });
}

export { lockDocument, lockVersion, LOCKED_VERSION_SELECT, type LockedVersion } from "./lock";

export class UploadRefusal extends Error {
  constructor(readonly finding: Finding, readonly status = 422) {
    super(finding.code);
  }
}

export interface UploadInput {
  org: DocumentOrg;
  store: BlobStore;
  bytes: Uint8Array;
  sha256: string;
  mediaType: string;
  originalFilename: string;
  title: string;
  documentClassId: string | null;
  /// Set to add a version to an existing document instead of creating one.
  documentId: string | null;
  recordedByPersonId: string;
  receivedOn: string | null;
  note: string;
}

export interface UploadResult {
  documentId: string;
  versionId: string;
  versionNo: number;
  sha256: string;
  byteSize: string;
  mediaType: string;
  status: "STAGED" | "FILED";
  warnings: Finding[];
}

/// The retention a document takes from its class at creation.
export function retentionSnapshotOf(c: { retentionMonths: number | null; retentionTrigger: string | null; disposalMethod: string | null; disposalAuthorityRoleCode: string | null; nameEn: string; provenance: string }): RetentionRule & { className: string; provenance: string } {
  return {
    retentionMonths: c.retentionMonths,
    retentionTrigger: c.retentionTrigger as RetentionRule["retentionTrigger"],
    disposalMethod: c.disposalMethod as RetentionRule["disposalMethod"],
    disposalAuthorityRoleCode: c.disposalAuthorityRoleCode,
    className: c.nameEn,
    provenance: c.provenance,
  };
}

export const retentionOf = (snapshot: unknown): RetentionRule | null => (isRetentionRule(snapshot) ? snapshot : null);

/**
 * Store an upload: one transaction creates the blob, the document (STAGED) or its next
 * version, and the audit rows. Every check runs on rows read inside it: the class and
 * the person, the received day against the organisation's today, and — for a new
 * version — the document's versions under its row lock. Refusals throw `UploadRefusal`,
 * so nothing is written.
 */
export async function storeUpload(actor: AuditActor, i: UploadInput): Promise<UploadResult> {
  const received = receivedOnFault(i.receivedOn, i.org.today);
  if (received) throw new UploadRefusal(received);
  const nameFault = filenameFault(i.originalFilename);
  if (nameFault) throw new UploadRefusal(nameFault);
  return db.$transaction(
    async (tx) => {
      const person = await tx.person.findFirst({ where: { id: i.recordedByPersonId, organisationId: i.org.id, isActive: true }, select: { id: true, name: true } });
      if (!person) throw new UploadRefusal({ code: "PERSON_UNKNOWN", level: "block" });

      let documentId: string;
      let versionNo: number;
      let status: "STAGED" | "FILED";
      let classification: SecurityClass | null;
      const warnings: Finding[] = [];

      if (i.documentId) {
        const doc = await tx.document.findFirst({ where: { id: i.documentId, organisationId: i.org.id }, select: { id: true } });
        if (!doc) throw new UploadRefusal({ code: "DOCUMENT_UNKNOWN", level: "block" }, 404);
        await lockDocument(tx, doc.id);
        const locked = await tx.document.findUniqueOrThrow({ where: { id: doc.id }, include: { versions: { select: { versionNo: true, sha256: true, withdrawnAt: true } } } });
        const fault = nextVersionFault(locked.versions, i.sha256);
        if (fault) throw new UploadRefusal(fault, 409);
        documentId = locked.id;
        versionNo = nextVersionNo(locked.versions);
        status = locked.status;
        classification = locked.classificationSnapshot;
      } else {
        const classCount = await tx.documentClass.count({ where: { organisationId: i.org.id } });
        if (classCount === 0) throw new UploadRefusal({ code: "CLASSES_NOT_CONFIGURED", level: "block" });
        if (!i.documentClassId) throw new UploadRefusal({ code: "CLASS_NOT_SET", level: "block" });
        // The class is held before it is read: its classification and retention are
        // snapshotted onto the document, and an edit of the class waits for this act.
        await shareDocumentClass(tx, i.documentClassId, i.org.id);
        const cls = await tx.documentClass.findFirst({ where: { id: i.documentClassId, organisationId: i.org.id } });
        if (!cls) throw new UploadRefusal({ code: "CLASS_UNKNOWN", level: "block" });
        if (!i.title.trim()) throw new UploadRefusal({ code: "TITLE_REQUIRED", level: "block" });
        classification = cls.classification;
        const doc = await tx.document.create({
          data: {
            organisationId: i.org.id,
            title: i.title.trim(),
            documentClassId: cls.id,
            classificationSnapshot: cls.classification,
            retentionSnapshot: retentionSnapshotOf(cls) as unknown as Prisma.InputJsonValue,
          },
        });
        await writeAudit(tx, { actor, organisationId: i.org.id, entity: "Document", entityId: doc.id, entityLabel: `Document · ${doc.title}` }, "CREATE", documentCreated({ title: doc.title, className: cls.nameEn, classification: cls.classification, status: "STAGED" }));
        documentId = doc.id;
        versionNo = 1;
        status = "STAGED";
      }
      if (classification == null) warnings.push({ code: "CLASSIFICATION_NOT_SET", level: "warn" });

      // The bytes, inside this transaction, keyed by their digest. Only transactional
      // drivers are built; one that is not would write before the transaction (ADR 0011).
      if (!i.store.transactional) throw new UploadRefusal({ code: "DRIVER_NOT_BUILT", level: "block" }, 503);
      await i.store.put(tx, i.org.id, i.sha256, i.bytes);
      const version = await tx.documentVersion.create({
        data: {
          organisationId: i.org.id,
          documentId,
          versionNo,
          sha256: i.sha256,
          byteSize: BigInt(i.bytes.byteLength),
          mediaType: i.mediaType,
          originalFilename: i.originalFilename,
          receivedOn: i.receivedOn ? dayToDate(i.receivedOn) : null,
          recordedByPersonId: person.id,
          note: i.note,
        },
      });
      const title = (await tx.document.findUniqueOrThrow({ where: { id: documentId }, select: { title: true } })).title;
      await writeAudit(
        tx,
        { actor, organisationId: i.org.id, entity: "DocumentVersion", entityId: version.id, entityLabel: `Document · ${title} · version ${versionNo}` },
        "CREATE",
        versionCreated({ versionNo, sha256: i.sha256, byteSize: version.byteSize, mediaType: i.mediaType, originalFilename: version.originalFilename, receivedOn: i.receivedOn, recordedBy: person.name, note: i.note }),
      );
      return { documentId, versionId: version.id, versionNo, sha256: i.sha256, byteSize: version.byteSize.toString(), mediaType: i.mediaType, status, warnings };
    },
    { timeout: 60_000, maxWait: 10_000 },
  );
}

/// A stored day as YYYY-MM-DD, or null.
export const dayOf = (d: Date | null | undefined) => (d ? storedDay(d) : null);
