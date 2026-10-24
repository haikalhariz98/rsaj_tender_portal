/**
 * Attach a stored version to an owner already locked (plan §2, step 5; wave V plan V2). The one core the staff attach (`attachDocument`, src/app/documents/actions.ts) and the
 * verify act of an online award return (`src/lib/award/online-return-store.ts`) share, so both judge an attach by the same rules. It never takes the owner's lock: its caller
 * holds it, and hands in the owner as `withLockedOwner` (or `awardLockedOwner`) built it.
 *
 * Under that lock: the version and its document (locked first, so a withdrawal committed meanwhile is seen and never pinned), the hidden-exercise check and the SULIT attach
 * refusal (both read as a document that is not there, and logged), `attachFault` with the purpose's live count, the attachment and its audit row, the document filed if it was
 * staged, and the owner's own consequence (`afterChange`), all in the caller's transaction. A refusal writes nothing and is returned as the form's words.
 */

import type { FormState } from "@/components/record-editor";
import { writeAudit } from "@/lib/audit/record";
import { auditActorOfStaff } from "@/lib/auth/audit-actor";
import { refuseHiddenExercise, restrictedExerciseIds } from "@/lib/auth/sulit-store";
import type { StaffActor } from "@/lib/auth/types";
import type { Tx } from "@/lib/db";

import { attachFault } from "./attach";
import { attached, filed } from "./audit-view";
import { sulitAttachRefused } from "./entitlement";
import { hiddenExerciseOfDocument } from "./hidden";
import { documentFaultText, PURPOSE_LABEL } from "./labels";
import { lockVersion } from "./lock";
import type { LockedOwner } from "./owners";
import { blocking, OWNER_COLUMN, type AttachmentPurpose, type Finding } from "./types";

const refuse = (fs: readonly Finding[]): FormState => ({ ok: false, message: fs.map(documentFaultText).join(" ") });

export async function attachToLockedOwner(tx: Tx, actor: StaffActor, o: LockedOwner, i: { purpose: AttachmentPurpose; versionId: string }): Promise<FormState> {
  const { purpose } = i;
  const ownerId = o.ref.id;
  const v = await lockVersion(tx, i.versionId, o.organisationId);
  if (!v) return refuse([{ code: "VERSION_UNKNOWN", level: "block" }]);
  const doc = await tx.document.findUniqueOrThrow({ where: { id: v.documentId, organisationId: actor.organisationId }, include: { documentClass: { select: { classification: true } } } });
  // OD-2 (review of Phase 3b): a document hanging on an exercise the actor may not see reads as unknown, and attaching a SULIT document gives its bytes to the record's people,
  // so it is refused to someone who may not open it already. Both read as a document that is not there, and the attempt is logged.
  const under = await hiddenExerciseOfDocument(doc.id, await restrictedExerciseIds(tx, actor.organisationId), tx);
  if ((under && (await refuseHiddenExercise(tx, actor, under))) || (await sulitAttachRefused(tx, actor, doc.id))) return refuse([{ code: "DOCUMENT_UNKNOWN", level: "block" }]);
  const col = OWNER_COLUMN[o.ref.kind];
  const already = await tx.documentAttachment.findFirst({ where: { [col]: ownerId, purpose, detachedAt: null, version: { documentId: doc.id } }, select: { id: true } });
  // Under the owner's lock: how many of this purpose it holds now (the purposes that hold one document refuse a second).
  const liveOfPurpose = await tx.documentAttachment.count({ where: { [col]: ownerId, purpose, detachedAt: null, version: { withdrawnAt: null } } });
  const faults = attachFault({ purpose, owner: o.facts, version: v, documentClass: doc.documentClass, documentClassification: doc.classificationSnapshot, alreadyAttached: !!already, liveOfPurpose });
  const blocks = blocking(faults);
  if (blocks.length) return refuse(blocks);
  const auditActor = auditActorOfStaff(actor);
  const row = await tx.documentAttachment.create({ data: { organisationId: o.organisationId, purpose, versionId: v.id, [col]: ownerId } });
  await writeAudit(tx, { actor: auditActor, organisationId: o.organisationId, entity: "DocumentAttachment", entityId: row.id, entityLabel: `${o.label} · ${PURPOSE_LABEL[purpose]}` }, "CREATE",
    attached({ purpose, title: doc.title, versionNo: v.versionNo, sha256: v.sha256, owner: o.label }));
  if (doc.status === "STAGED") {
    await tx.document.update({ where: { id: doc.id, organisationId: actor.organisationId }, data: { status: "FILED", filedAt: new Date() } });
    await writeAudit(tx, { actor: auditActor, organisationId: o.organisationId, entity: "Document", entityId: doc.id, entityLabel: `Document · ${doc.title}` }, "UPDATE", filed());
  }
  const after = o.afterChange ? await o.afterChange(tx) : null;
  const warns = faults.filter((f) => f.level === "warn").map(documentFaultText);
  return { ok: true, message: [after, ...warns].filter(Boolean).join(" ") || undefined };
}
