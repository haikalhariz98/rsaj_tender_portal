"use server";

import { exerciseIsHidden, hiddenExercises, restrictedExercises } from "@/app/_auth/sulit";
import { exerciseOfOwner, hiddenExerciseOfDocument, hiddenExerciseOfVersion } from "@/lib/documents/hidden";
import { refuseHiddenExercise, restrictedExerciseIds, type Reader } from "@/lib/auth/sulit-store";
import { revalidatePath } from "next/cache";

import type { FormState } from "@/components/record-editor";
import { writeAudit, type Tx } from "@/lib/audit/record";
import { attachFault, detachFault, reliedOnAttachment, repinFault } from "@/lib/documents/attach";
import { attached, detached, filed, holdPlaced, holdReleased, reclassified, repinAudit, replacedBecause, versionWithdrawn } from "@/lib/documents/audit-view";
import { reclassifyFault, reclassifyKind } from "@/lib/documents/classification";
import { holdFaults, releaseFaults } from "@/lib/documents/hold";
import { documentFaultText, FINGERPRINT_STATEMENT, PURPOSE_LABEL } from "@/lib/documents/labels";
import { ownerOf, withLockedOwner, type LockedOwner } from "@/lib/documents/owners";
import type { OwnerRef } from "@/lib/documents/repo";
import { documentBytesAccess, ownerBytesEntitled, sulitAttachRefused } from "@/lib/documents/entitlement";
import { attachTargetsOf, documentDrawer, ownerPanel, TARGET_CAP, uploadContext } from "@/lib/documents/read";
import { documentOrg, lockDocument, lockVersion, LOCKED_VERSION_SELECT, logAccess } from "@/lib/documents/service";
import { blobStore, sha256Hex } from "@/lib/documents/store";
import { ATTACHMENT_PURPOSES, blocking, OWNER_COLUMN, OWNER_KINDS, SECURITY_CLASSES, type Finding } from "@/lib/documents/types";
import { withdrawFault } from "@/lib/documents/versioning";
import { loadAttributions } from "@/lib/auth/attribution-read";
import { drawerAttributionQueries, drawerView, panelAttributionQueries, panelView, type DrawerView, type PanelOptions, type PanelView } from "@/lib/documents/views";
import { db } from "@/lib/db";
import { FormReader } from "@/lib/validate";
import { requireStaff, toAuditActor } from "@/app/_auth/actor";
import { attributionRefusalState } from "@/app/_auth/act";
import { beginAct } from "@/app/_auth/act";
import type { AuditActor } from "@/lib/auth/types";
import type { OrgScope } from "@/lib/org-scope";

/**
 * The document store's acts (plan §2, §3, step 5). Each is reachable by a direct POST,
 * so each re-runs its pure check inside one transaction on locked rows: the owner first
 * (by its own module's lock), then the document. The write and its audit row share the
 * transaction; a refusal writes nothing and names what to do instead. The signed-in
 * officer is named on every audit row, and a hold is attributed to the officer who placed or released it (`beginAct`, Phase 2b).
 *
 * The upload itself is the Route Handler `POST /api/documents` (Server Actions cap a
 * body at 1 MB); attaching what it stored is `attachDocument`, with the `versionId` it returned.
 */

class Refusal extends Error {
  constructor(readonly state: FormState) {
    super(state.message ?? "Refused");
  }
}

const GONE: FormState = { ok: false, message: "That record no longer exists." };
const refuse = (fs: readonly Finding[]): FormState => ({ ok: false, message: fs.map(documentFaultText).join(" ") });
const docLabel = (title: string) => `Document · ${title}`;

async function inOwner(scope: Reader, actor: AuditActor, ref: OwnerRef, fn: (tx: Tx, o: LockedOwner) => Promise<FormState>): Promise<FormState> {
  let paths: string[] = [];
  let result: FormState | null;
  try {
    result = await withLockedOwner(scope, actor, ref, async (tx, o) => {
      paths = o.paths;
      return fn(tx, o);
    });
  } catch (e) {
    if (e instanceof Refusal) return e.state;
    const attribution = attributionRefusalState(e);
    if (attribution) return attribution;
    throw e;
  }
  if (result?.ok) for (const p of [...paths, "/configuration/documents"]) revalidatePath(p);
  return result ?? GONE;
}

async function inDocument(scope: Reader, documentId: string, fn: (tx: Tx, orgId: string) => Promise<FormState>): Promise<FormState> {
  const org = await documentOrg(scope.organisationId);
  if (!org) return refuse([{ code: "NO_ORGANISATION", level: "block" }]);
  let result: FormState;
  try {
    result = await db.$transaction(async (tx) => {
      const found = await tx.document.findFirst({ where: { id: documentId, organisationId: org.id }, select: { id: true } });
      if (!found) return refuse([{ code: "DOCUMENT_UNKNOWN", level: "block" }]);
      // FR-MTD-007: a document hanging on an exercise restricted to its named people reads as one that does not exist, and the attempt is logged.
      const under = await hiddenExerciseOfDocument(documentId, await restrictedExerciseIds(tx, scope.organisationId), tx);
      if (under && (await refuseHiddenExercise(tx, scope, under))) return refuse([{ code: "DOCUMENT_UNKNOWN", level: "block" }]);
      await lockDocument(tx, documentId);
      return fn(tx, org.id);
    });
  } catch (e) {
    if (e instanceof Refusal) return e.state;
    throw e;
  }
  // A version-level act shows wherever the document is attached.
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

/// Where an attachment is, read without a lock, to know which owner to lock.
async function attachmentOwner(scope: OrgScope, attachmentId: string): Promise<OwnerRef | null> {
  const org = await documentOrg(scope.organisationId);
  if (!org) return null;
  const a = await db.documentAttachment.findFirst({ where: { id: attachmentId, organisationId: org.id }, select: { meetingId: true, exerciseId: true, awardId: true, delegationId: true, specificationPanelId: true, bqVersionId: true, tenderPackPartId: true, addendumId: true, bidWithdrawalId: true, validityExtensionId: true, openingId: true, evaluationId: true, evaluationMeetingId: true, evaluationBidderId: true, supplierDocumentId: true, supplierApplicationId: true, contractId: true, variationInstructionId: true, standingEventId: true, delayNoticeId: true, eotClaimId: true } });
  return a ? ownerOf(a) : null;
}

// ------------------------------------------------------------------ attach

/**
 * Attach a stored version to an owner for a purpose. Under the owner's lock: the
 * version and its document (locked), `attachFault` on what was read, the attachment and
 * its audit row, the document filed if it was staged, and the owner's own consequence
 * (`afterChange`), all in one act.
 */
export async function attachDocument(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const r = new FormReader(data);
  const kind = r.choice("ownerKind", "Record", OWNER_KINDS, { required: true });
  const ownerId = r.text("ownerId", "Record", { required: true });
  const purpose = r.choice("purpose", "Attached as", ATTACHMENT_PURPOSES, { required: true });
  const versionId = r.text("versionId", "Document", { required: true });
  if (r.failed || !kind || !purpose) return { ok: false, errors: r.errors };
  const ref: OwnerRef = { kind, id: ownerId };
  return inOwner(actor, toAuditActor(actor), ref, async (tx, o) => {
    // The document is locked before the version is judged (`lockVersion`): a withdrawal
    // committed while this act waited is seen here, never pinned.
    const v = await lockVersion(tx, versionId, o.organisationId);
    if (!v) return refuse([{ code: "VERSION_UNKNOWN", level: "block" }]);
    const doc = await tx.document.findUniqueOrThrow({ where: { id: v.documentId, organisationId: actor.organisationId }, include: { documentClass: { select: { classification: true } } } });
    // OD-2 (review of Phase 3b): a document hanging on an exercise the actor may not see reads as unknown, and attaching a SULIT document gives its bytes to the record's people,
    // so it is refused to someone who may not open it already. Both read as a document that is not there, and the attempt is logged.
    const under = await hiddenExerciseOfDocument(doc.id, await restrictedExerciseIds(tx, actor.organisationId), tx);
    if ((under && (await refuseHiddenExercise(tx, actor, under))) || (await sulitAttachRefused(tx, actor, doc.id))) return refuse([{ code: "DOCUMENT_UNKNOWN", level: "block" }]);
    const col = OWNER_COLUMN[kind];
    const already = await tx.documentAttachment.findFirst({ where: { [col]: ownerId, purpose, detachedAt: null, version: { documentId: doc.id } }, select: { id: true } });
    const faults = attachFault({ purpose, owner: o.facts, version: v, documentClass: doc.documentClass, documentClassification: doc.classificationSnapshot, alreadyAttached: !!already });
    const blocks = blocking(faults);
    if (blocks.length) return refuse(blocks);
    const row = await tx.documentAttachment.create({ data: { organisationId: o.organisationId, purpose, versionId: v.id, [col]: ownerId } });
    await writeAudit(tx, { actor: toAuditActor(actor), organisationId: o.organisationId, entity: "DocumentAttachment", entityId: row.id, entityLabel: `${o.label} · ${PURPOSE_LABEL[purpose]}` }, "CREATE",
      attached({ purpose, title: doc.title, versionNo: v.versionNo, sha256: v.sha256, owner: o.label }));
    if (doc.status === "STAGED") {
      await tx.document.update({ where: { id: doc.id, organisationId: actor.organisationId }, data: { status: "FILED", filedAt: new Date() } });
      await writeAudit(tx, { actor: toAuditActor(actor), organisationId: o.organisationId, entity: "Document", entityId: doc.id, entityLabel: docLabel(doc.title) }, "UPDATE", filed());
    }
    const after = o.afterChange ? await o.afterChange(tx) : null;
    const warns = faults.filter((f) => f.level === "warn").map(documentFaultText);
    return { ok: true, message: [after, ...warns].filter(Boolean).join(" ") || undefined };
  });
}

/// Take an attachment off its owner, with the reason; never one a judged record stands on.
export async function detachDocument(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const attachmentId = String(data.get("attachmentId") ?? "");
  const reason = String(data.get("reason") ?? "").trim();
  if (!reason) return { ok: false, errors: { reason: "Give the reason it is taken off." } };
  const ref = await attachmentOwner(actor, attachmentId);
  if (!ref) return GONE;
  return inOwner(actor, toAuditActor(actor), ref, async (tx, o) => {
    const a = await tx.documentAttachment.findFirst({ where: { id: attachmentId, organisationId: o.organisationId, [OWNER_COLUMN[ref.kind]]: ref.id }, include: { version: { select: { versionNo: true, withdrawnAt: true, document: { select: { title: true } } } } } });
    if (!a) return GONE;
    const live = await tx.documentAttachment.count({ where: { [OWNER_COLUMN[ref.kind]]: ref.id, purpose: a.purpose, detachedAt: null, version: { withdrawnAt: null } } });
    // Only a live attachment can be relied on: a withdrawn pin always comes off.
    const faults = detachFault({ purpose: a.purpose, owner: o.facts, reason, reliedOn: reliedOnAttachment(a, () => o.reliance(a.purpose, live, a.versionId)), detachedAt: a.detachedAt });
    if (faults.length) return refuse(faults);
    await tx.documentAttachment.update({ where: { id: a.id, organisationId: actor.organisationId }, data: { detachedAt: new Date(), detachReason: reason } });
    await writeAudit(tx, { actor: toAuditActor(actor), organisationId: o.organisationId, entity: "DocumentAttachment", entityId: a.id, entityLabel: `${o.label} · ${PURPOSE_LABEL[a.purpose]}`, reason }, "UPDATE",
      detached({ purpose: a.purpose, title: a.version.document.title, versionNo: a.version.versionNo, reason }));
    const after = o.afterChange ? await o.afterChange(tx) : null;
    return { ok: true, message: after ?? undefined };
  });
}

/**
 * Attach a newer version of the same document in place of the one pinned (OD-8): one
 * audited act with its reason. The old pin is closed, naming the version that replaced
 * it, and a new one opened, so the record shows which version stood when. Refused while
 * the owner is frozen; judged records keep their own snapshots.
 */
export async function attachNewVersion(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const attachmentId = String(data.get("attachmentId") ?? "");
  const versionId = String(data.get("versionId") ?? "");
  const reason = String(data.get("reason") ?? "").trim();
  const ref = await attachmentOwner(actor, attachmentId);
  if (!ref) return GONE;
  return inOwner(actor, toAuditActor(actor), ref, async (tx, o) => {
    const col = OWNER_COLUMN[ref.kind];
    const a = await tx.documentAttachment.findFirst({ where: { id: attachmentId, organisationId: o.organisationId, [col]: ref.id }, include: { version: { select: { id: true, documentId: true, versionNo: true } } } });
    if (!a) return GONE;
    // The pinned document is locked first, then the version to move to is read and judged:
    // a withdrawal committed while this act waited is seen, never pinned. A version of
    // another document is refused (NOT_SAME_DOCUMENT) whatever its state.
    await lockDocument(tx, a.version.documentId);
    const to = await tx.documentVersion.findFirst({ where: { id: versionId, organisationId: o.organisationId }, select: { ...LOCKED_VERSION_SELECT, document: { select: { title: true } } } });
    if (!to) return refuse([{ code: "VERSION_UNKNOWN", level: "block" }]);
    const faults = repinFault({ purpose: a.purpose, owner: o.facts, reason, attachment: { detachedAt: a.detachedAt, versionId: a.versionId, documentId: a.version.documentId }, to });
    if (faults.length) return refuse(faults);
    await tx.documentAttachment.update({ where: { id: a.id, organisationId: actor.organisationId }, data: { detachedAt: new Date(), detachReason: replacedBecause(to.versionNo, reason) } });
    const row = await tx.documentAttachment.create({ data: { organisationId: o.organisationId, purpose: a.purpose, versionId: to.id, [col]: ref.id } });
    // Each attachment's trail under its own id: the old one closed, the new one opened.
    const entityLabel = `${o.label} · ${PURPOSE_LABEL[a.purpose]}`;
    for (const e of repinAudit({ purpose: a.purpose, title: to.document.title, owner: o.label, reason, from: { attachmentId: a.id, versionNo: a.version.versionNo }, to: { attachmentId: row.id, versionNo: to.versionNo, sha256: to.sha256 } })) {
      await writeAudit(tx, { actor: toAuditActor(actor), organisationId: o.organisationId, entity: "DocumentAttachment", entityId: e.entityId, entityLabel, reason }, e.action, e.changes);
    }
    const after = o.afterChange ? await o.afterChange(tx) : null;
    return { ok: true, message: after ?? undefined };
  });
}

// ------------------------------------------------------------------ the document itself

/// Withdraw a version, once, with its reason. Never refused because something relied on
/// it: a judged record that pinned it learns at its next act (an award's issue refuses).
export async function withdrawVersion(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const versionId = String(data.get("versionId") ?? "");
  const reason = String(data.get("reason") ?? "").trim();
  const org = await documentOrg(actor.organisationId);
  if (!org) return refuse([{ code: "NO_ORGANISATION", level: "block" }]);
  // Looked up within the organisation: another organisation's id reads as unknown, in the
  // same words as a missing one (audit C-5).
  const v0 = await db.documentVersion.findFirst({ where: { id: versionId, organisationId: org.id }, select: { documentId: true } });
  if (!v0) return refuse([{ code: "VERSION_UNKNOWN", level: "block" }]);
  return inDocument(actor, v0.documentId, async (tx, orgId) => {
    const v = await tx.documentVersion.findFirstOrThrow({ where: { id: versionId, organisationId: orgId }, include: { document: { select: { title: true } } } });
    const f = withdrawFault(v, reason);
    if (f) return f.code === "REASON_REQUIRED" ? { ok: false, errors: { reason: documentFaultText(f) } } : refuse([f]);
    await tx.documentVersion.update({ where: { id: v.id, organisationId: actor.organisationId }, data: { withdrawnAt: new Date(), withdrawnReason: reason } });
    await writeAudit(tx, { actor: toAuditActor(actor), organisationId: orgId, entity: "DocumentVersion", entityId: v.id, entityLabel: `${docLabel(v.document.title)} · version ${v.versionNo}`, reason }, "UPDATE", versionWithdrawn({ versionNo: v.versionNo, reason }));
    return { ok: true };
  });
}

/// Set an unset classification once, or raise one, with a reason. Never lowered, never
/// unset, and an unset one never set below its class's classification as it stands now
/// (BD-DS-11 as ruled, security audit C-4).
export async function reclassifyDocument(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const documentId = String(data.get("documentId") ?? "");
  const r = new FormReader(data);
  const next = r.choice("classification", "Classification", SECURITY_CLASSES, { required: true });
  const reason = r.text("reason", "Reason", { max: 2000 });
  if (r.failed) return { ok: false, errors: r.errors };
  return inDocument(actor, documentId, async (tx, orgId) => {
    // The class's classification as it stands now: the class row is held (FOR SHARE) so a
    // concurrent edit of the class waits for this act, then read under the document's lock.
    const { documentClassId } = await tx.document.findUniqueOrThrow({ where: { id: documentId, organisationId: actor.organisationId }, select: { documentClassId: true } });
    await tx.$queryRaw`SELECT id FROM "DocumentClass" WHERE id = ${documentClassId} FOR SHARE`;
    const doc = await tx.document.findUniqueOrThrow({ where: { id: documentId, organisationId: actor.organisationId }, include: { documentClass: { select: { classification: true } } } });
    const faults = reclassifyFault(doc.classificationSnapshot, next, reason, doc.documentClass.classification);
    if (faults.length) return refuse(faults);
    await tx.document.update({ where: { id: doc.id, organisationId: actor.organisationId }, data: { classificationSnapshot: next } });
    await writeAudit(tx, { actor: toAuditActor(actor), organisationId: orgId, entity: "Document", entityId: doc.id, entityLabel: docLabel(doc.title), reason: `${reclassifyKind(doc.classificationSnapshot, next!) === "SET" ? "Classification set" : reclassifyKind(doc.classificationSnapshot, next!) === "RAISED" ? "Classification raised" : "Classification lowered"}: ${reason}` }, "UPDATE",
      reclassified({ from: doc.classificationSnapshot, to: next! }));
    return { ok: true };
  });
}

/// Place a legal hold, by the signed-in officer, with the reason (NFR-RET-002).
export async function placeLegalHold(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const begun = await beginAct(actor, data, "LegalHold.placedBy", { personField: "personId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  const personId = act.subjectPersonId;
  const documentId = String(data.get("documentId") ?? "");
  const reason = String(data.get("reason") ?? "").trim();
  return inDocument(actor, documentId, async (tx, orgId) => {
    const doc = await tx.document.findUniqueOrThrow({ where: { id: documentId, organisationId: actor.organisationId }, include: { holds: { select: { releasedAt: true } } } });
    const person = personId ? await tx.person.findFirst({ where: { id: personId, organisationId: orgId, isActive: true }, select: { id: true, name: true } }) : null;
    if (personId && !person) return { ok: false, errors: { personId: documentFaultText({ code: "PERSON_UNKNOWN", level: "block" }) } };
    const faults = holdFaults({ reason, personId: person?.id ?? null, standing: doc.holds });
    if (faults.length) return refuse(faults);
    const hold = await tx.legalHold.create({ data: { organisationId: orgId, documentId, reason, placedByPersonId: person!.id } });
    await writeAudit(tx, { actor: toAuditActor(actor), organisationId: orgId, entity: "LegalHold", entityId: hold.id, entityLabel: `${docLabel(doc.title)} · legal hold`, reason }, "CREATE", holdPlaced({ reason, placedBy: person!.name }));
    await act.write(tx, hold.id);
    return { ok: true };
  });
}

/// Release a standing legal hold, by the signed-in officer, with the reason.
export async function releaseLegalHold(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const begun = await beginAct(actor, data, "LegalHold.releasedBy", { personField: "personId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  const personId = act.subjectPersonId;
  const holdId = String(data.get("holdId") ?? "");
  const reason = String(data.get("reason") ?? "").trim();
  const org = await documentOrg(actor.organisationId);
  if (!org) return refuse([{ code: "NO_ORGANISATION", level: "block" }]);
  // Within the organisation, so another's hold id reads as missing does (audit C-5).
  const h0 = await db.legalHold.findFirst({ where: { id: holdId, organisationId: org.id }, select: { documentId: true } });
  if (!h0) return GONE;
  return inDocument(actor, h0.documentId, async (tx, orgId) => {
    const hold = await tx.legalHold.findFirstOrThrow({ where: { id: holdId, organisationId: orgId }, include: { document: { select: { title: true } } } });
    const person = personId ? await tx.person.findFirst({ where: { id: personId, organisationId: orgId, isActive: true }, select: { id: true, name: true } }) : null;
    if (personId && !person) return { ok: false, errors: { personId: documentFaultText({ code: "PERSON_UNKNOWN", level: "block" }) } };
    const faults = releaseFaults({ hold, reason, personId: person?.id ?? null });
    if (faults.length) return refuse(faults);
    await tx.legalHold.update({ where: { id: hold.id, organisationId: actor.organisationId }, data: { releasedAt: new Date(), releaseReason: reason, releasedByPersonId: person!.id } });
    await writeAudit(tx, { actor: toAuditActor(actor), organisationId: orgId, entity: "LegalHold", entityId: hold.id, entityLabel: `${docLabel(hold.document.title)} · legal hold`, reason }, "UPDATE", holdReleased({ reason, releasedBy: person!.name }));
    await act.write(tx, hold.id);
    return { ok: true };
  });
}

/**
 * Verify a version's fingerprint (NFR-AUD-003, OD-9): the stored bytes are read and
 * hashed again. Allowed for every version, SULIT included — nothing is served. Logged as
 * VERIFIED or INTEGRITY_FAILED.
 */
export async function verifyVersion(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const versionId = String(data.get("versionId") ?? "");
  const org = await documentOrg(actor.organisationId);
  if (!org) return refuse([{ code: "NO_ORGANISATION", level: "block" }]);
  const v = await db.documentVersion.findFirst({ where: { id: versionId, organisationId: org.id }, select: { id: true, sha256: true } });
  if (!v) return refuse([{ code: "VERSION_UNKNOWN", level: "block" }]);
  // FR-MTD-007: a version hanging on an exercise restricted to its named people reads as one that does not exist, and the attempt is logged.
  const under = await hiddenExerciseOfVersion(v.id, await restrictedExercises(actor));
  if (under && (await exerciseIsHidden(actor, under))) return refuse([{ code: "VERSION_UNKNOWN", level: "block" }]);
  const s = blobStore();
  if ("fault" in s) return refuse([{ code: s.fault, level: "block" }]);
  const bytes = await s.store.get(org.id, v.sha256);
  const ok = !!bytes && sha256Hex(bytes) === v.sha256;
  await logAccess({ organisationId: org.id, kind: ok ? "VERIFIED" : "INTEGRITY_FAILED", reasonCode: ok ? "" : bytes ? "DIGEST_MISMATCH" : "BYTES_MISSING", versionId: v.id, actor });
  revalidatePath("/", "layout");
  return ok
    ? { ok: true, message: `The fingerprint matches what was stored. ${FINGERPRINT_STATEMENT}` }
    : { ok: false, message: "The stored file does not match its fingerprint. This has been logged; report it to whoever runs the portal." };
}

// ------------------------------------------------------------------ reads for the client islands

/// One document for the drawer, as words and dates. Null when it does not exist.
export async function loadDocumentDrawer(documentId: string): Promise<DrawerView | null> {
  const actor = await requireStaff();
  const entitled = (await documentBytesAccess(db, actor, String(documentId), { logRead: false })).entitled;
  const [org, d] = await Promise.all([documentOrg(actor.organisationId), documentDrawer(actor.organisationId, String(documentId), entitled)]);
  if (!d) return null;
  // FR-MTD-007: a document hanging on an exercise restricted to its named people reads as one that does not exist, and the attempt is logged.
  const under = await hiddenExerciseOfDocument(d.id, await restrictedExercises(actor));
  if (under && (await exerciseIsHidden(actor, under))) return null;
  // Who recorded each version and placed or released each hold, signed or recorded from paper, is read from the attributions (Phase 2b).
  const acted = await loadAttributions(db, actor.organisationId, drawerAttributionQueries(d));
  return drawerView(d, org?.timeZone ?? null, acted);
}

/// An owner's panel, for a drawer that opens it on request (a delegation's documents).
export async function loadOwnerPanel(ref: OwnerRef, opts: PanelOptions = {}): Promise<PanelView | null> {
  const actor = await requireStaff();
  if (!OWNER_KINDS.includes(ref.kind)) return null;
  // FR-MTD-007: the documents of an exercise restricted to its named people (or of anything under it) read as nobody's, and the attempt is logged.
  const owning = await exerciseOfOwner(ref.kind, ref.id);
  if (owning && (await exerciseIsHidden(actor, owning))) return null;
  const entitled = await ownerBytesEntitled(db, actor, ref.kind, ref.id);
  const [org, panel, upload] = await Promise.all([documentOrg(actor.organisationId), ownerPanel(actor.organisationId, ref, entitled), uploadContext(actor.organisationId)]);
  if (!panel || !upload) return null;
  const acted = await loadAttributions(db, actor.organisationId, panelAttributionQueries(panel));
  return panelView(panel, upload, org?.timeZone ?? null, opts, acted);
}

/// The records of one kind a received document can be attached to, with what each keeps and whether it is open. `cap` says how many are listed at most.
export async function loadAttachTargets(kind: string) {
  const actor = await requireStaff();
  const k = OWNER_KINDS.find((x) => x === kind);
  if (!k) return null;
  return { ...(await attachTargetsOf(actor.organisationId, k, await hiddenExercises(actor))), cap: TARGET_CAP };
}
