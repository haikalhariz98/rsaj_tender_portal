/**
 * The document store's writes that are not an owner's: storing an upload, logging an
 * access, and the reads they need. Server-side; every rule it applies is a pure
 * function from this directory, run on rows read inside the write's transaction.
 */

import type { Prisma } from "@/generated/prisma/client";
import { writeAudit, type Tx } from "@/lib/audit/record";
import { dayToDate, todayIn } from "@/lib/dates";
import { db } from "@/lib/db";

import { filenameFault } from "./access";
import { lockDocument, shareDocumentClass } from "./lock";
import { documentCreated, versionCreated } from "./audit-view";
import { eligibleProjectClasses } from "./project-class";
import { receivedOnFault } from "./received";
import { isRetentionRule, type RetentionRule } from "./retention";
import type { BlobStore } from "./store";
import type { AccessKind, Finding, SecurityClass, StorePolicy } from "./types";
import { nextVersionFault, nextVersionNo } from "./versioning";
import type { ActWriter } from "@/lib/auth/act-writer";
import type { AuditActor, StaffActor } from "@/lib/auth/types";
import { documentBytesAccess } from "./entitlement";
import { hiddenExerciseIds, refuseHiddenExercise, restrictedExerciseIds, type Reader, type SulitReader } from "@/lib/auth/sulit-store";

import { hiddenExerciseOfDocument } from "./hidden";
import { APPLICANT_WORDS, SUPPLIER_UPLOADER_WORDS } from "./labels";

export interface DocumentOrg {
  id: string;
  code: string;
  timeZone: string | null;
  /// Null while the organisation has no time zone.
  today: string | null;
}

/// The signed-in actor's organisation (ADR 0034 D10). Null when it no longer exists.
export async function documentOrg(organisationId: string, client: Tx = db): Promise<DocumentOrg | null> {
  const org = await client.organisation.findUnique({ where: { id: organisationId }, select: { id: true, code: true, timeZone: true } });
  return org ? { id: org.id, code: org.code, timeZone: org.timeZone, today: todayIn(new Date(), org.timeZone) } : null;
}

export async function loadStorePolicy(organisationId: string, client: Tx = db): Promise<StorePolicy & { provenance: string | null; notes: string; id: string | null; onlineBidFileClassId: string | null; projectDocumentClassId: string | null; awardReturnClassId: string | null }> {
  const p = await client.documentStorePolicy.findUnique({ where: { organisationId } });
  if (!p) return { id: null, allowedMediaTypes: [], maxBytes: null, provenance: null, notes: "", onlineBidFileClassId: null, projectDocumentClassId: null, awardReturnClassId: null };
  return { id: p.id, allowedMediaTypes: p.allowedMediaTypes, maxBytes: p.maxBytes, provenance: p.provenance, notes: p.notes, onlineBidFileClassId: p.onlineBidFileClassId, projectDocumentClassId: p.projectDocumentClassId, awardReturnClassId: p.awardReturnClassId };
}

/// The classes the "Class for project files" select offers: this organisation's, classified and not SULIT (`projectClassFault`), in the screen's order, as `{ value, label }`.
export async function loadProjectClassChoices(organisationId: string, client: Tx = db): Promise<{ value: string; label: string }[]> {
  const rows = await client.documentClass.findMany({ where: { organisationId }, orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }], select: { id: true, nameEn: true, classification: true } });
  return eligibleProjectClasses(rows).map((c) => ({ value: c.id, label: c.nameEn }));
}

/// A signed-in supplier opening or being refused its own registration's file (Phase 4b): the actor is the supplier's account, never a person.
export interface SupplierAccessActor {
  organisationId: string;
  supplierAccountId: string;
  sessionId: string;
  sourceAddress: string | null;
}

/// Who asked, for an access event: a signed-in person with their session and address, a loader run by its label (Phase 3b), or a signed-in supplier (Phase 4b).
export type AccessActor = (Pick<StaffActor, "organisationId" | "personId" | "sessionId" | "sourceAddress"> & { system?: { label: string } }) | SupplierAccessActor;

const isSupplierActor = (a: AccessActor): a is SupplierAccessActor => "supplierAccountId" in a;

/// Append one access event. Refusals and downloads are logged even where nothing else is written. `actor` names who asked; none for an act nobody was signed in to ask.
export async function logAccess(
  e: { organisationId: string; kind: AccessKind; reasonCode?: string; versionId?: string | null; offeredFilename?: string | null; offeredBytes?: bigint | null; actor?: AccessActor | null },
  client: Tx = db,
): Promise<void> {
  const who = e.actor ?? null;
  const supplier = who && isSupplierActor(who) ? who : null;
  const staff = who && !isSupplierActor(who) ? who : null;
  await client.documentAccessEvent.create({
    data: {
      organisationId: e.organisationId,
      kind: e.kind,
      reasonCode: e.reasonCode ?? "",
      actorPersonId: staff && !staff.system ? staff.personId : null,
      actorSystemLabel: staff?.system ? staff.system.label : null,
      actorSupplierAccountId: supplier ? supplier.supplierAccountId : null,
      actorSessionId: supplier ? supplier.sessionId || null : staff && !staff.system ? staff.sessionId || null : null,
      sourceAddress: who?.sourceAddress ?? null,
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
  /// Who recorded it: an officer (a Person, recorded on their behalf, not signed), a signed-in supplier's own account (Phase 4b), or an applicant who is not signed in, named by the
  /// online application it came with (ADR 0041 D3). Exactly one.
  recordedByPersonId: string | null;
  recordedBySupplierAccountId?: string | null;
  recordedByPortalApplicationId?: string | null;
  /// Work done in the upload's own transaction, around the store's own writes (Phase 4b: the supplier's draft is locked before anything is read, the quota is judged on the locked
  /// rows, and the new version is attached to its owner before the transaction ends). A refusal thrown from a hook rolls the whole upload back.
  hooks?: {
    before?: (tx: Tx) => Promise<void>;
    after?: (tx: Tx, created: { documentId: string; versionId: string; versionNo: number }) => Promise<void>;
  };
  /// Whoever is uploading, for a version added to an existing document: a document hanging on an exercise restricted to its named people reads as one that does
  /// not exist to anyone not named on it (FR-MTD-007). A loader that stores directly has none and is hidden from nothing.
  reader?: SulitReader;
  /// How the upload was recorded, attributed in the same transaction (Phase 2b). A loader that stores directly has none.
  act?: ActWriter;
  receivedOn: string | null;
  note: string;
  /// What a new document is staged for (`staged-for.ts`), recorded on it. Ignored for a version added to a document.
  stagedFor?: string | null;
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
  // A refusal is thrown from inside the transaction and rolls it back, which would take the access log with it: the access to a restricted exercise is logged
  // first, in its own commit, and the same judgement is made again under the document's lock.
  if (i.documentId && i.reader) {
    await refuseUploadToHiddenDocument(i.reader, i.org.id, i.documentId);
    await refuseUploadToClosedDocument(i.reader, i.org.id, i.documentId);
  }
  return db.$transaction((tx) => storeUploadTx(tx, actor, i), { timeout: 60_000, maxWait: 10_000 });
}

/**
 * `storeUpload`'s work in the caller's transaction (ADR 0041, plan 3.2): the one-submission registration stores every file of an application inside the transaction that creates the
 * application, so a refusal anywhere leaves no byte (the blob store is transactional, ADR 0011). The caller has already judged the file's name and received day, as `storeUpload` does.
 */
export async function storeUploadTx(tx: Tx, actor: AuditActor, i: UploadInput): Promise<UploadResult> {
  // The recorder: an active Person of the organisation, a supplier's account of it, or an online application of it. Exactly one (the database holds that too).
  const person = i.recordedByPersonId ? await tx.person.findFirst({ where: { id: i.recordedByPersonId, organisationId: i.org.id, isActive: true }, select: { id: true, name: true } }) : null;
  const account = !i.recordedByPersonId && i.recordedBySupplierAccountId ? await tx.supplierAccount.findFirst({ where: { id: i.recordedBySupplierAccountId, organisationId: i.org.id }, select: { id: true } }) : null;
  const applicant = !i.recordedByPersonId && !i.recordedBySupplierAccountId && i.recordedByPortalApplicationId ? await tx.portalApplication.findFirst({ where: { id: i.recordedByPortalApplicationId, organisationId: i.org.id }, select: { id: true } }) : null;
  if (!person && !account && !applicant) throw new UploadRefusal({ code: "PERSON_UNKNOWN", level: "block" });
  // The trail names an officer by name, and a supplier's account or an applicant never by anyone's name (Phase 4a, decision 10; ADR 0041 D3).
  const recorderName = person ? person.name : account ? SUPPLIER_UPLOADER_WORDS : APPLICANT_WORDS;
  await i.hooks?.before?.(tx);

  let documentId: string;
  let versionNo: number;
  let status: "STAGED" | "FILED";
  let classification: SecurityClass | null;
  const warnings: Finding[] = [];

  if (i.documentId) {
    const doc = await tx.document.findFirst({ where: { id: i.documentId, organisationId: i.org.id }, select: { id: true } });
    if (!doc) throw new UploadRefusal({ code: "DOCUMENT_UNKNOWN", level: "block" }, 404);
    await lockDocument(tx, doc.id);
    // Before the versions are read or compared: whether the same file is already there must not be told to someone who may not see the document.
    if (i.reader && (await hiddenExerciseOfDocument(doc.id, await hiddenExerciseIds(tx, i.reader), tx))) throw new UploadRefusal({ code: "DOCUMENT_UNKNOWN", level: "block" }, 404);
    // C-6, against per-person access (Phase 3b): "this file is identical to version N" confirms a guess of a SULIT document’s bytes, so it is told only to someone who may open
    // them. Anyone else adding a version to it is refused first, as to a document they cannot open, whatever the file is.
    if (i.reader && !i.reader.system) {
      const held = await tx.document.findUniqueOrThrow({ where: { id: doc.id }, select: { classificationSnapshot: true } });
      if (held.classificationSnapshot === "SULIT" && !(await documentBytesAccess(tx, i.reader, doc.id, { logRead: false })).entitled) throw new UploadRefusal({ code: "DOCUMENT_UNKNOWN", level: "block" }, 404);
    }
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
        stagedFor: i.stagedFor ?? null,
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
      recordedByPersonId: person?.id ?? null,
      recordedBySupplierAccountId: account?.id ?? null,
      recordedByPortalApplicationId: applicant?.id ?? null,
      note: i.note,
    },
  });
  const title = (await tx.document.findUniqueOrThrow({ where: { id: documentId }, select: { title: true } })).title;
  await writeAudit(
    tx,
    { actor, organisationId: i.org.id, entity: "DocumentVersion", entityId: version.id, entityLabel: `Document · ${title} · version ${versionNo}` },
    "CREATE",
    versionCreated({ versionNo, sha256: i.sha256, byteSize: version.byteSize, mediaType: i.mediaType, originalFilename: version.originalFilename, receivedOn: i.receivedOn, recordedBy: recorderName, note: i.note }),
  );
  await i.act?.write(tx, version.id);
  await i.hooks?.after?.(tx, { documentId, versionId: version.id, versionNo });
  return { documentId, versionId: version.id, versionNo, sha256: i.sha256, byteSize: version.byteSize.toString(), mediaType: i.mediaType, status, warnings };
}

/// The access to a restricted exercise's document by someone adding a version to it, logged (allowed or refused) in its own commit; refused as a document that is not there.
async function refuseUploadToHiddenDocument(reader: Reader, organisationId: string, documentId: string): Promise<void> {
  const found = await db.document.findFirst({ where: { id: documentId, organisationId }, select: { id: true } });
  if (!found) return;
  const under = await hiddenExerciseOfDocument(documentId, await restrictedExerciseIds(db, organisationId));
  if (under && (await refuseHiddenExercise(db, reader, under))) throw new UploadRefusal({ code: "DOCUMENT_UNKNOWN", level: "block" }, 404);
}

/// C-6 (Phase 3b): adding a version to a SULIT document is asking whether a file is already in it, which confirms a guess at its bytes; so it is asked of someone who may open them. The access
/// is logged, allowed or refused, in its own commit (the refusal is thrown from outside the upload’s transaction), and judged again under the document’s lock.
async function refuseUploadToClosedDocument(reader: SulitReader, organisationId: string, documentId: string): Promise<void> {
  if (reader.system) return;
  const found = await db.document.findFirst({ where: { id: documentId, organisationId }, select: { classificationSnapshot: true } });
  if (found?.classificationSnapshot !== "SULIT") return;
  if (!(await documentBytesAccess(db, reader, documentId)).entitled) throw new UploadRefusal({ code: "DOCUMENT_UNKNOWN", level: "block" }, 404);
}
